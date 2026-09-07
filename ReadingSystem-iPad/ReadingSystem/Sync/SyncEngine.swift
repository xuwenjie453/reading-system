// SyncEngine.swift — iPad 同步引擎（dev.ipad_sync）
// Receive → decode → dedup/epoch validate → DB transaction durable apply → emit UI → ACK（ACK 不提前）。
// GraphPatch 仅 local_revision == base 才 apply；Mismatch 请求 recovery，不 blind merge。
// Snapshot 只替换 CONTENT，保留 Layout/Annotation。

import Foundation

/// 会话视图状态（语义页面；scroll/zoom/drag/Anchor Card 不递增 revision）
public typealias ViewState = ClientStore.ViewState

@MainActor
public final class SyncEngine: ObservableObject {
    @Published public private(set) var graphId: String?
    @Published public private(set) var snapshot: ContentSnapshot?
    @Published public private(set) var graphRevision: Int = 0
    @Published public private(set) var connected: Bool = false
    @Published public private(set) var statusText: String = "未连接"

    private let store: ClientStore
    private var connection: BridgeConnection?
    private var clientSeq: Int = 0
    private var outboxTimer: Timer?

    public init(store: ClientStore) {
        self.store = store
        Task { await restoreLocalState() }
    }

    /// 冷启动：先恢复本地缓存，再尝试连接（先是可靠本地阅读器，再是网络客户端）
    private func restoreLocalState() {
        Task {
            if let gid = try? await store.lastGraphId(),
               let content = try? await store.loadContent(graphId: gid) {
                self.graphId = gid
                self.snapshot = content.snapshot
                self.graphRevision = content.revision
                self.statusText = "本地缓存（离线可读）"
            }
        }
    }

    public func attach(_ connection: BridgeConnection) {
        self.connection = connection
        connection.onEnvelope = { [weak self] env in
            Task { await self?.handle(env) }
        }
        connection.onConnected = { [weak self] in
            Task { await self?.resumeSession() }
        }
        startOutboxLoop()
    }

    /// 已配对设备每次连上后的第一步：凭持久化身份恢复会话，无需再配对
    public func resumeSession() {
        Task {
            let id = await identity()
            send(.init(type: "SESSION_CONNECT", payload: .init(json: [
                "device_id": .string(id),
                "client_seq": .number(Double(clientSeq)),
                "since_server_seq": .number(0),
            ])))
        }
    }

    // MARK: - 入站处理
    public func handle(_ env: BridgeEnvelope) async {
        // 重复消息：at-least-once + dedup = one effect
        if await store.isDuplicate(messageId: env.message_id) { return }

        switch env.type {
        case "PAIR_OK":
            let epoch = env.payload["session_epoch"]?.intValue ?? 0
            currentEpoch = epoch
            try? await store.setEpoch(epoch)
            try? await store.dropPendingNavsBeforeEpoch(epoch)
            connection?.markPaired()
            // 重连顺序：新 epoch → 发送 SESSION_CONNECT 完成同步
            let deviceId = (try? await store.deviceId()) ?? ""
            send(.init(type: "SESSION_CONNECT", payload: .init(json: [
                "device_id": .string(deviceId),
                "client_seq": .number(Double(clientSeq)),
                "since_server_seq": .number(0),
            ])))

        case "SESSION_READY":
            let epoch = env.payload["session_epoch"]?.intValue ?? 0
            currentEpoch = epoch
            try? await store.setEpoch(epoch)
            connected = true
            connection?.markReady()
            statusText = "已连接 Mac"
            // 尾步：上报当前 VIEW_SNAPSHOT 建立 Focus baseline
            await reportViewSnapshot()

        case "CONTENT_SNAPSHOT":
            await applySnapshot(env)

        case "GRAPH_PATCH":
            await applyPatch(env)

        case "NAVIGATION_COMMAND":
            await applyNavigation(env)

        case "ANNOTATION_CONFLICT":
            statusText = "批注冲突：已保留两份（preserve-both）"

        case "ERROR":
            let msg = env.payload["error"]?.objectValue?["message"]?.stringValue ?? "未知错误"
            statusText = "Mac 端错误: \(msg)"

        default:
            break
        }
    }

    private func applySnapshot(_ env: BridgeEnvelope) async {
        guard let snapJson = env.payload["snapshot"]?.objectValue else { return }
        let snap = ContentSnapshot(snapshot: snapJson)
        let revision = snap.graphRevision
        // durable apply（DB 事务）之后才 ACK
        do {
            try await store.saveContent(graphId: snap.graphId, revision: revision, snapshot: snap)
        } catch {
            statusText = "本地存储失败: \(error)"
            return
        }
        graphId = snap.graphId
        snapshot = snap
        graphRevision = revision
        // Snapshot 只替换 CONTENT：Layout/Annotation 表不受影响
        ack(env)
    }

    private func applyPatch(_ env: BridgeEnvelope) async {
        let patch = env.payload
        guard let gid = patch["graph_id"]?.stringValue,
              let base = patch["base_revision"]?.intValue,
              let newRev = patch["new_revision"]?.intValue else { return }
        guard gid == graphId else {
            // 尚未有该图：请求快照恢复
            statusText = "收到未知 Graph 补丁，等待快照…"
            return
        }
        guard graphRevision == base else {
            // REVISION_MISMATCH：请求 snapshot/backfill，不 blind merge
            statusText = "版本不匹配（本地 \(graphRevision) vs 基准 \(base)），请求恢复…"
            send(.init(type: "SYNC_REQUEST", payload: .init(json: [
                "graph_id": .string(gid),
                "reason": .string("REVISION_MISMATCH"),
                "local_revision": .number(Double(graphRevision)),
            ])))
            return
        }
        if let graphJson = patch["graph"]?.objectValue {
            let snap = ContentSnapshot(snapshot: graphJson)
            try? await store.saveContent(graphId: gid, revision: newRev, snapshot: snap)
            snapshot = snap
            graphRevision = newRev
        }
        ack(env)
    }

    /// NavigationCommand：CONDITIONAL 仅当当前 basis 仍有效才切页；stale 不抢页
    private func applyNavigation(_ env: BridgeEnvelope) async {
        guard let cmdId = env.payload["command_id"]?.stringValue,
              let mode = env.payload["mode"]?.stringValue else { return }
        let target = env.payload["target"]?.objectValue ?? [:]
        let basis = env.payload["basis_view_revision"]?.intValue ?? 0
        let epoch = await store.getEpoch()
        let targetJsonData = (try? JSONSerialization.data(withJSONObject: target)) ?? Data()
        let targetJson = String(data: targetJsonData, encoding: .utf8) ?? "{}"
        try? await store.savePendingNav(commandId: cmdId, mode: mode, targetJson: targetJson, basis: basis, epoch: epoch)

        guard mode == "CONDITIONAL" else {
            // EXPLICIT：Mac 用户明确导航 → 直接进入（仍需本地 durable + ViewCommitted）
            _ = try? await enterTarget(target: target)
            ack(env)
            return
        }
        let view = (try? await store.getViewState()) ?? .init(graphId: nil, viewKind: nil, entityId: nil, viewRevision: 0)
        if view.viewRevision == basis {
            _ = try? await enterTarget(target: target)
        }
        // basis 失配 → STALE：节点已在（快照/补丁同步过），页面不动
        ack(env)
    }

    /// 本地优先导航：先本地 durable 提交 ViewState，再入 outbox 发 ViewCommitted
    @discardableResult
    public func enterTarget(target: [String: JSONValue]) async throws -> ViewState {
        guard let gid = target["graph_id"]?.stringValue,
              let viewKind = target["view_kind"]?.stringValue else { return (try? await store.getViewState()) ?? .init(graphId: nil, viewKind: nil, entityId: nil, viewRevision: 0) }
        let entityId = target["entity_id"]?.stringValue
        let view = try await store.commitView(graphId: gid, viewKind: viewKind, entityId: entityId)
        graphId = gid
        // 若本地还没有该图内容，保持当前 snapshot；等 Mac 推送
        await enqueueOutbox(kind: "ViewCommitted", payload: viewCommittedPayload(view: view, cause: nil))
        objectWillChange.send()
        return view
    }

    // MARK: - 出站（Outbox：durable before send）
    public func commitLocalView(graphId gid: String, viewKind: String, entityId: String?) async {
        guard let view = try? await store.commitView(graphId: gid, viewKind: viewKind, entityId: entityId) else { return }
        await enqueueOutbox(kind: "ViewCommitted", payload: viewCommittedPayload(view: view, cause: nil))
        objectWillChange.send()
    }

    public func savePinnedPosition(graphId gid: String, nodeId: String, x: Double, y: Double) async {
        let pos = ClientStore.PinnedPosition(nodeId: nodeId, x: x, y: y)
        guard let newRev = try? await store.pinPosition(graphId: gid, position: pos) else { return }
        let payload: [String: JSONValue] = [
            "graph_id": .string(gid),
            "base_layout_revision": .number(Double(newRev - 1)),
            "new_layout_revision": .number(Double(newRev)),
            "positions": .object([nodeId: .object(["x": .number(x), "y": .number(y), "pin": .string("USER_PINNED")])]),
        ]
        await enqueueOutbox(kind: "LayoutPatch", payload: jsonString(payload))
    }

    /// 读取某 Entity 的本地批注（含 layoutEpoch → Reader 布局锁定用）
    public func loadAnnotation(entityId: String) async -> ReaderAnnotationData? {
        guard let gid = graphId else { return nil }
        let bundle = try? await store.loadAnnotation(graphId: gid, entityId: entityId)
        return ReaderAnnotationData(entityId: entityId, bundle: bundle)
    }

    /// Pencil 落笔后的 Annotation 快照（v1 完整快照，不做 stroke CRDT）
    /// layoutEpoch：本次落笔锁定的 LayoutProfile 编码（旧 Ink 永不 reflow 的依据）
    public func saveAnnotation(graphId gid: String, entityId: String, drawingData: Data, layoutEpoch: String) async {
        let existing = try? await store.loadAnnotation(graphId: gid, entityId: entityId)
        let newRev = (existing?.revision ?? 0) + 1
        let annId = existing?.annotationId ?? ("ann_" + UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: ""))
        try? await store.saveAnnotation(annotationId: annId, graphId: gid, entityId: entityId,
                                        revision: newRev, drawing: drawingData, layoutEpoch: layoutEpoch)
        let payload: [String: JSONValue] = [
            "annotation_id": .string(annId),
            "graph_id": .string(gid),
            "entity_id": .string(entityId),
            "base_revision": .number(Double(newRev - 1)),
            "new_revision": .number(Double(newRev)),
            "writer": .string((try? await store.deviceId()) ?? "ipad"),
            "drawing_data": .string(drawingData.base64EncodedString()),
        ]
        await enqueueOutbox(kind: "AnnotationSnapshot", payload: jsonString(payload))
    }

    private func enqueueOutbox(kind: String, payload: String) async {
        try? await store.enqueueOutbox(kind: kind, payload: payload)
        flushOutbox()
    }

    /// Outbox flush：页面离开/后台/断线恢复时强制 flush
    public func flushOutbox() {
        Task {
            guard let items = try? await store.pendingOutbox() else { return }
            for item in items {
                guard let data = item.payload.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data),
                      let obj = json as? [String: JSONValue] else { continue }
                let type: String
                switch item.kind {
                case "ViewCommitted": type = "VIEW_COMMITTED"
                case "LayoutPatch": type = "LAYOUT_PATCH"
                case "AnnotationSnapshot": type = "ANNOTATION_SNAPSHOT"
                default: type = item.kind
                }
                send(.init(type: type, payload: .init(json: obj)))
                try? await store.markOutboxSent(seq: item.seq)
            }
        }
    }

    private func startOutboxLoop() {
        outboxTimer?.invalidate()
        outboxTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.flushOutbox() }
        }
    }

    private func viewCommittedPayload(view: ClientStore.ViewState, cause: String?) -> String {
        let payload: [String: JSONValue] = [
            "graph_id": .string(view.graphId ?? ""),
            "view_kind": .string(view.viewKind ?? ""),
            "entity_id": view.entityId.map { .string($0) } ?? .null,
            "view_revision": .number(Double(view.viewRevision)),
            "session_epoch": .number(Double(currentEpoch)),
            "cause_command_id": cause.map { .string($0) } ?? .null,
            "client_seq": .number(Double(clientSeq + 1)),
        ]
        clientSeq += 1
        return jsonString(payload)
    }

    @Published public private(set) var currentEpoch: Int = 0

    /// 重连尾步：上报当前 VIEW_SNAPSHOT，Mac 接受 baseline 并派生 Focus
    private func reportViewSnapshot() async {
        let view = (try? await store.getViewState()) ?? .init(graphId: nil, viewKind: nil, entityId: nil, viewRevision: 0)
        guard let gid = view.graphId else { return }
        send(.init(type: "VIEW_SNAPSHOT", payload: .init(json: [
            "graph_id": .string(gid),
            "view_kind": .string(view.viewKind ?? "TOPOLOGY_VIEW"),
            "entity_id": view.entityId.map { .string($0) } ?? .null,
            "view_revision": .number(Double(view.viewRevision)),
            "session_epoch": .number(Double(currentEpoch)),
        ])))
    }

    // MARK: - 配对与身份（一次配对，永久自动重连）
    /// 设备身份只生成一次并持久化；之后每次启动/重连都复用，Mac 端保持信任
    public func identity() async -> String {
        if let saved = try? await store.deviceId(), !saved.isEmpty { return saved }
        let id = "ipad-" + UUID().uuidString.prefix(8).lowercased()
        try? await store.setDeviceId(id)
        return id
    }

    public func pair(code: String, name: String) {
        Task {
            let id = await identity()
            send(.init(type: "PAIR_REQUEST", payload: .init(json: [
                "device_id": .string(id),
                "pairing_code": .string(code),
                "device_name": .string(name),
            ])))
        }
    }

    /// 前台恢复 / 启动时调用：能自动连就自动连，绝不要求重新配对
    public func reconnectIfNeeded() {
        let st = connection?.state ?? .disconnected
        if st == .ready || st == .connecting || st == .connected {
            flushOutbox() // 已连接：只补发 outbox
            return
        }
        connection?.autoReconnect()
    }

    private func send(_ env: BridgeEnvelope) {
        connection?.send(env)
    }

    private func ack(_ env: BridgeEnvelope) {
        guard let seq = env.server_seq else { return }
        send(.init(type: "ACK", payload: .init(json: ["server_seq": .number(Double(seq))])))
    }

    private func jsonString(_ obj: [String: JSONValue]) -> String {
        guard let data = try? JSONEncoder().encode(obj) else { return "{}" }
        return String(data: data, encoding: .utf8) ?? "{}"
    }
}
