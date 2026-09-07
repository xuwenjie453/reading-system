// ClientStore.swift — iPad 本地优先存储（SQLite + Actor）
// 数据域分离：CONTENT cache / PRESENTATION / ANNOTATION / SESSION / INBOX dedup / OUTBOX / checkpoints。
// 铁律：本地 durable（DB 事务提交）之后才允许 emit / ACK。

import Foundation
import SQLite3

public actor ClientStore {
    private var db: OpaquePointer?
    private let dbPath: String

    public init(path: String) throws {
        self.dbPath = path
        var handle: OpaquePointer?
        guard sqlite3_open(path, &handle) == SQLITE_OK else {
            throw StoreError.openFailed
        }
        self.db = handle
        try exec("PRAGMA journal_mode = WAL;")
        try exec("PRAGMA synchronous = FULL;")
        try migrate()
    }

    public enum StoreError: Error {
        case openFailed, sqlFailed(String)
    }

    private func exec(_ sql: String) throws {
        var err: UnsafeMutablePointer<CChar>?
        guard sqlite3_exec(db, sql, nil, nil, &err) == SQLITE_OK else {
            let msg = err.map { String(cString: $0) } ?? "unknown"
            sqlite3_free(err)
            throw StoreError.sqlFailed(msg)
        }
    }

    private func migrate() throws {
        try exec("""
        CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS content_graph (
          graph_id TEXT PRIMARY KEY, graph_revision INTEGER NOT NULL,
          root_block_id TEXT, root_block_title TEXT, root_block_summary TEXT, root_block_content TEXT,
          nodes_json TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS layout (
          graph_id TEXT PRIMARY KEY, layout_revision INTEGER NOT NULL,
          nodes_json TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS annotations (
          annotation_id TEXT PRIMARY KEY, graph_id TEXT NOT NULL, entity_id TEXT NOT NULL,
          layout_epoch TEXT, revision INTEGER NOT NULL, drawing_data BLOB, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS session_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          session_epoch INTEGER DEFAULT 0,
          graph_id TEXT, view_kind TEXT, entity_id TEXT, view_revision INTEGER DEFAULT 0,
          local_device_id TEXT
        );
        CREATE TABLE IF NOT EXISTS inbox_dedup (message_id TEXT PRIMARY KEY, processed_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS outbox (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          kind TEXT NOT NULL, payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL, sent_at TEXT
        );
        CREATE TABLE IF NOT EXISTS pending_nav (
          command_id TEXT PRIMARY KEY, mode TEXT, target_json TEXT,
          basis_view_revision INTEGER, epoch INTEGER, created_at TEXT NOT NULL
        );
        """)
    }

    // MARK: kv
    public func getKV(_ key: String) -> String? {
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }
        guard sqlite3_prepare_v2(db, "SELECT value FROM kv WHERE key = ?1", -1, &stmt, nil) == SQLITE_OK else { return nil }
        sqlite3_bind_text(stmt, 1, (key as NSString).utf8String, -1, nil)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        return String(cString: sqlite3_column_text(stmt, 0))
    }
    public func setKV(_ key: String, _ value: String) throws {
        try exec("INSERT INTO kv (key, value) VALUES ('\(escape(key))', '\(escape(value))') ON CONFLICT(key) DO UPDATE SET value = excluded.value;")
    }

    private func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "'", with: "''")
    }

    private func queryString(_ sql: String) throws -> [[String: String]] {
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw StoreError.sqlFailed("prepare failed")
        }
        var rows: [[String: String]] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            var row: [String: String] = [:]
            let count = sqlite3_column_count(stmt)
            for i in 0..<count {
                let name = String(cString: sqlite3_column_name(stmt, i))
                if let c = sqlite3_column_text(stmt, i) { row[name] = String(cString: c) }
            }
            rows.append(row)
        }
        return rows
    }

    // MARK: CONTENT
    public func saveContent(graphId: String, revision: Int, snapshot: ContentSnapshot) throws {
        let nodesData = try JSONEncoder().encode(snapshot.nodes)
        let nodesJson = String(data: nodesData, encoding: .utf8) ?? "[]"
        try exec("""
        INSERT INTO content_graph (graph_id, graph_revision, root_block_id, root_block_title, root_block_summary, root_block_content, nodes_json, updated_at)
        VALUES ('\(escape(graphId))', \(revision), '\(escape(snapshot.rootBlockId))', '\(escape(snapshot.rootBlockTitle ?? ""))', '\(escape(snapshot.rootBlockSummary ?? ""))', '\(escape(snapshot.rootBlockContent))', '\(escape(nodesJson))', '\(now())')
        ON CONFLICT(graph_id) DO UPDATE SET graph_revision = excluded.graph_revision,
          root_block_id = excluded.root_block_id, root_block_title = excluded.root_block_title,
          root_block_summary = excluded.root_block_summary, root_block_content = excluded.root_block_content,
          nodes_json = excluded.nodes_json, updated_at = excluded.updated_at;
        """)
    }

    public func loadContent(graphId: String) throws -> (revision: Int, snapshot: ContentSnapshot?)? {
        let rows = try queryString("SELECT * FROM content_graph WHERE graph_id = '\(escape(graphId))'")
        guard let row = rows.first else { return nil }
        let revision = Int(row["graph_revision"] ?? "0") ?? 0
        let nodes = (try? JSONDecoder().decode([NodeDTO].self, from: Data((row["nodes_json"] ?? "[]").utf8))) ?? []
        let snapshot = ContentSnapshot(
            snapshotId: "local", graphId: graphId, graphRevision: revision,
            rootBlockId: row["root_block_id"] ?? "", rootBlockTitle: row["root_block_title"],
            rootBlockSummary: row["root_block_summary"], rootBlockContent: row["root_block_content"] ?? "",
            nodes: nodes)
        return (revision, snapshot)
    }

    public func lastGraphId() throws -> String? {
        let rows = try queryString("SELECT graph_id FROM content_graph ORDER BY updated_at DESC LIMIT 1")
        return rows.first?["graph_id"]
    }

    // MARK: PRESENTATION（USER_PINNED 本地立即持久化，再发 LayoutPatch）
    public struct PinnedPosition: Codable, Sendable, Equatable {
        public var nodeId: String
        public var x: Double
        public var y: Double
        public init(nodeId: String, x: Double, y: Double) { self.nodeId = nodeId; self.x = x; self.y = y }
    }

    public func loadLayout(graphId: String) throws -> (revision: Int, positions: [PinnedPosition]) {
        let rows = try queryString("SELECT * FROM layout WHERE graph_id = '\(escape(graphId))'")
        guard let row = rows.first else { return (0, []) }
        let positions = (try? JSONDecoder().decode([PinnedPosition].self, from: Data((row["nodes_json"] ?? "[]").utf8))) ?? []
        return (Int(row["layout_revision"] ?? "0") ?? 0, positions)
    }

    @discardableResult
    public func pinPosition(graphId: String, position: PinnedPosition) throws -> Int {
        let (rev, loaded) = try loadLayout(graphId: graphId)
        var positions = loaded
        if let idx = positions.firstIndex(where: { $0.nodeId == position.nodeId }) {
            positions[idx] = position
        } else {
            positions.append(position)
        }
        let data = try JSONEncoder().encode(positions)
        let json = String(data: data, encoding: .utf8) ?? "[]"
        let newRev = rev + 1
        try exec("""
        INSERT INTO layout (graph_id, layout_revision, nodes_json, updated_at)
        VALUES ('\(escape(graphId))', \(newRev), '\(escape(json))', '\(now())')
        ON CONFLICT(graph_id) DO UPDATE SET layout_revision = excluded.layout_revision, nodes_json = excluded.nodes_json, updated_at = excluded.updated_at;
        """)
        return newRev
    }

    // MARK: ANNOTATION（local-first；PKDrawing vector 是真源，PNG 只是缓存）
    public func saveAnnotation(annotationId: String, graphId: String, entityId: String, revision: Int, drawing: Data, layoutEpoch: String = "v1") throws {
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }
        let sql = "INSERT INTO annotations (annotation_id, graph_id, entity_id, layout_epoch, revision, drawing_data, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(annotation_id) DO UPDATE SET revision = excluded.revision, drawing_data = excluded.drawing_data, layout_epoch = excluded.layout_epoch, updated_at = excluded.updated_at;"
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw StoreError.sqlFailed("ann prepare") }
        sqlite3_bind_text(stmt, 1, (annotationId as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 2, (graphId as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 3, (entityId as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 4, (layoutEpoch as NSString).utf8String, -1, nil)
        sqlite3_bind_int(stmt, 5, Int32(revision))
        sqlite3_bind_blob(stmt, 6, (drawing as NSData).bytes, Int32(drawing.count), nil)
        sqlite3_bind_text(stmt, 7, (now() as NSString).utf8String, -1, nil)
        guard sqlite3_step(stmt) == SQLITE_DONE else { throw StoreError.sqlFailed("ann step") }
    }

    public struct AnnotationBundle: Sendable {
        public let annotationId: String
        public let revision: Int
        public let layoutEpoch: String?
        public let drawing: Data
    }

    public func loadAnnotation(graphId: String, entityId: String) throws -> AnnotationBundle? {
        let rows = try queryString("SELECT * FROM annotations WHERE graph_id = '\(escape(graphId))' AND entity_id = '\(escape(entityId))' ORDER BY revision DESC LIMIT 1")
        guard let row = rows.first, let annId = row["annotation_id"] else { return nil }
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }
        guard sqlite3_prepare_v2(db, "SELECT drawing_data FROM annotations WHERE annotation_id = '\(escape(annId))'", -1, &stmt, nil) == SQLITE_OK,
              sqlite3_step(stmt) == SQLITE_ROW,
              let bytes = sqlite3_column_blob(stmt, 0) else { return nil }
        let count = Int(sqlite3_column_bytes(stmt, 0))
        let data = Data(bytes: bytes, count: count)
        return AnnotationBundle(annotationId: annId,
                                revision: Int(row["revision"] ?? "0") ?? 0,
                                layoutEpoch: row["layout_epoch"],
                                drawing: data)
    }

    // MARK: SESSION / ViewState（本地权威；先 durable 再发 ViewCommitted）
    public struct ViewState: Codable, Sendable {
        public var graphId: String?
        public var viewKind: String?   // TOPOLOGY_VIEW | BLOCK_VIEW | NODE_VIEW
        public var entityId: String?
        public var viewRevision: Int
        public init(graphId: String?, viewKind: String?, entityId: String?, viewRevision: Int) {
            self.graphId = graphId; self.viewKind = viewKind; self.entityId = entityId; self.viewRevision = viewRevision
        }
    }

    public func getViewState() throws -> ViewState {
        let rows = try queryString("SELECT * FROM session_state WHERE id = 1")
        guard let r = rows.first else { return ViewState(graphId: nil, viewKind: nil, entityId: nil, viewRevision: 0) }
        return ViewState(graphId: r["graph_id"], viewKind: r["view_kind"], entityId: r["entity_id"], viewRevision: Int(r["view_revision"] ?? "0") ?? 0)
    }

    /// 语义页面变化才递增 revision（scroll/zoom/drag/Anchor Card 不递增）
    @discardableResult
    public func commitView(graphId: String, viewKind: String, entityId: String?) throws -> ViewState {
        var view = try getViewState()
        let semanticChange = view.graphId != graphId || view.viewKind != viewKind || view.entityId != entityId
        if semanticChange { view.viewRevision += 1 }
        view.graphId = graphId; view.viewKind = viewKind; view.entityId = entityId
        try exec("""
        UPDATE session_state SET graph_id = '\(escape(graphId))', view_kind = '\(escape(viewKind))',
          entity_id = '\(escape(entityId ?? ""))', view_revision = \(view.viewRevision) WHERE id = 1;
        """)
        if try queryString("SELECT id FROM session_state WHERE id = 1").isEmpty {
            try exec("INSERT INTO session_state (id, view_revision, graph_id, view_kind, entity_id) VALUES (1, \(view.viewRevision), '\(escape(graphId))', '\(escape(viewKind))', '\(escape(entityId ?? ""))');")
        }
        return view
    }

    public func setEpoch(_ epoch: Int) throws {
        try exec("UPDATE session_state SET session_epoch = \(epoch) WHERE id = 1;")
        if try queryString("SELECT id FROM session_state WHERE id = 1").isEmpty {
            try exec("INSERT INTO session_state (id, session_epoch) VALUES (1, \(epoch));")
        }
    }
    public func getEpoch() -> Int {
        (try? queryString("SELECT session_epoch FROM session_state WHERE id = 1"))?.first?["session_epoch"].flatMap(Int.init) ?? 0
    }
    public func setDeviceId(_ id: String) throws { try setKV("device_id", id) }
    public func deviceId() -> String? { getKV("device_id") }

    // MARK: INBOX dedup
    public func isDuplicate(messageId: String) -> Bool {
        guard !messageId.isEmpty else { return false }
        do {
            try exec("INSERT INTO inbox_dedup (message_id, processed_at) VALUES ('\(escape(messageId))', '\(now())');")
            return false
        } catch { return true }
    }

    // MARK: OUTBOX（先 durable 再发送；同对象 coalesce 到最新）
    public func enqueueOutbox(kind: String, payload: String) throws {
        // coalesce：同 kind+对象键 只保留最新未发送
        let coalesceKey: String?
        switch kind {
        case "ViewCommitted": coalesceKey = "ViewCommitted"
        case "AnnotationSnapshot": coalesceKey = "AnnotationSnapshot:\(annotationKey(payload))"
        default: coalesceKey = nil
        }
        if let key = coalesceKey {
            let rows = try queryString("SELECT seq FROM outbox WHERE sent_at IS NULL AND kind = '\(escape(kind))' AND payload_json LIKE '%\(escape(key))%'")
            for row in rows {
                try exec("DELETE FROM outbox WHERE seq = \(row["seq"] ?? "0");")
            }
        }
        try exec("INSERT INTO outbox (kind, payload_json, created_at) VALUES ('\(escape(kind))', '\(escape(payload))', '\(now())');")
    }

    private func annotationKey(_ payload: String) -> String {
        // payload 内 entity_id 作为 coalesce 键的粗提取
        if let r = payload.range(of: "\"entity_id\":\"") {
            return String(payload[r.upperBound...].prefix(40))
        }
        return "default"
    }

    public struct OutboxItem: Sendable {
        public let seq: Int
        public let kind: String
        public let payload: String
    }

    public func pendingOutbox(limit: Int = 20) throws -> [OutboxItem] {
        let rows = try queryString("SELECT seq, kind, payload_json FROM outbox WHERE sent_at IS NULL ORDER BY seq LIMIT \(limit)")
        return rows.compactMap { r in
            guard let seq = Int(r["seq"] ?? ""), let kind = r["kind"], let payload = r["payload_json"] else { return nil }
            return OutboxItem(seq: seq, kind: kind, payload: payload)
        }
    }

    public func markOutboxSent(seq: Int) throws {
        try exec("UPDATE outbox SET sent_at = '\(now())' WHERE seq = \(seq);")
    }

    // MARK: pending conditional navigation（旧 epoch 的 conditional nav 不 replay）
    public func savePendingNav(commandId: String, mode: String, targetJson: String, basis: Int, epoch: Int) throws {
        try exec("DELETE FROM pending_nav WHERE epoch < \(epoch);")
        try exec("INSERT OR REPLACE INTO pending_nav (command_id, mode, target_json, basis_view_revision, epoch, created_at) VALUES ('\(escape(commandId))', '\(escape(mode))', '\(escape(targetJson))', \(basis), \(epoch), '\(now())');")
    }
    public func consumePendingNav(commandId: String) throws -> (targetJson: String, basis: Int, mode: String)? {
        let rows = try queryString("SELECT * FROM pending_nav WHERE command_id = '\(escape(commandId))'")
        guard let r = rows.first else { return nil }
        try exec("DELETE FROM pending_nav WHERE command_id = '\(escape(commandId))';")
        return (r["target_json"] ?? "{}", Int(r["basis_view_revision"] ?? "0") ?? 0, r["mode"] ?? "CONDITIONAL")
    }
    public func dropPendingNavsBeforeEpoch(_ epoch: Int) throws {
        try exec("DELETE FROM pending_nav WHERE epoch < \(epoch);")
    }

    private func now() -> String { ISO8601DateFormatter().string(from: Date()) }

    public func close() {
        sqlite3_close(db)
    }
}
