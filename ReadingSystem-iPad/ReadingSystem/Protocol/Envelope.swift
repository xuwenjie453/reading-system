// Envelope.swift — Reading Bridge 协议信封（与 Mac bridge-server.mjs 语义一致）
// Domain: CONTENT / PRESENTATION / SESSION / ANNOTATION（各自独立 revision，不混用）

import Foundation

public let RSProtocolVersion = 1

public enum RSDomain: String, Codable, Sendable {
    case content = "CONTENT"
    case presentation = "PRESENTATION"
    case session = "SESSION"
    case annotation = "ANNOTATION"
}

public struct BridgeEnvelope: Codable, Sendable {
    public var protocol_version: Int
    public var message_id: String
    public var server_seq: Int?
    public var domain: String?
    public var type: String
    public var sent_at: String?
    public var payload: BridgePayload

    public init(type: String, payload: BridgePayload, messageId: String = UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: "m")) {
        self.protocol_version = RSProtocolVersion
        self.message_id = messageId
        self.type = type
        self.payload = payload
        self.sent_at = ISO8601DateFormatter().string(from: Date())
    }
}

/// 载荷采用“宽松 JSON 容器”策略：类型化读取，缺字段不崩
public struct BridgePayload: Codable, Sendable {
    public var json: [String: JSONValue]

    public init(json: [String: JSONValue]) { self.json = json }

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        self.json = (try? c.decode([String: JSONValue].self)) ?? [:]
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(json)
    }
    public subscript(key: String) -> JSONValue? { json[key] }
}

// MARK: - JSONValue（宽松 JSON 表示）

public enum JSONValue: Codable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else if let o = try? c.decode([String: JSONValue].self) { self = .object(o) }
        else { throw DecodingError.dataCorruptedError(in: c, debugDescription: "unsupported json") }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    public var stringValue: String? { if case .string(let s) = self { return s }; return nil }
    public var intValue: Int? { if case .number(let n) = self { return Int(n) }; return nil }
    public var doubleValue: Double? { if case .number(let n) = self { return n }; return nil }
    public var boolValue: Bool? { if case .bool(let b) = self { return b }; return nil }
    public var arrayValue: [JSONValue]? { if case .array(let a) = self { return a }; return nil }
    public var objectValue: [String: JSONValue]? { if case .object(let o) = self { return o }; return nil }
}

// MARK: - 内容快照（CONTENT Domain；只替换 CONTENT，不清 Ink/Layout）

public struct ContentSnapshot: Sendable {
    public let snapshotId: String
    public let graphId: String
    public let graphRevision: Int
    public let rootBlockId: String
    public let rootBlockTitle: String?
    public let rootBlockSummary: String?
    public let rootBlockContent: String
    public let nodes: [NodeDTO]

    public init(snapshotId: String, graphId: String, graphRevision: Int,
                rootBlockId: String, rootBlockTitle: String?, rootBlockSummary: String?,
                rootBlockContent: String, nodes: [NodeDTO]) {
        self.snapshotId = snapshotId
        self.graphId = graphId
        self.graphRevision = graphRevision
        self.rootBlockId = rootBlockId
        self.rootBlockTitle = rootBlockTitle
        self.rootBlockSummary = rootBlockSummary
        self.rootBlockContent = rootBlockContent
        self.nodes = nodes
    }

    public init(snapshot: [String: JSONValue]) {
        self.snapshotId = snapshot["snapshot_id"]?.stringValue ?? ""
        self.graphId = snapshot["graph_id"]?.stringValue ?? ""
        self.graphRevision = snapshot["graph_revision"]?.intValue ?? 0
        let rb = snapshot["root_block"]?.objectValue ?? [:]
        self.rootBlockId = rb["block_id"]?.stringValue ?? ""
        self.rootBlockTitle = rb["title"]?.stringValue
        self.rootBlockSummary = rb["anchor_summary"]?.stringValue
        self.rootBlockContent = rb["content"]?.stringValue ?? ""
        self.nodes = (snapshot["nodes"]?.arrayValue ?? []).compactMap { NodeDTO(json: $0.objectValue ?? [:]) }
    }
}

public struct SegmentDTO: Sendable, Identifiable, Codable {
    public let ordinal: Int
    public let text: String
    public var id: Int { ordinal }
    public init?(json: [String: JSONValue]) {
        guard let ordinal = json["ordinal"]?.intValue else { return nil }
        self.ordinal = ordinal
        self.text = json["text"]?.stringValue ?? ""
    }
}

public struct NodeDTO: Sendable, Identifiable, Codable {
    public let id: String
    public let parentId: String?
    public let depth: Int
    public let title: String
    public let anchorSummary: String
    public let segmentCount: Int
    public let segments: [SegmentDTO]

    public init?(json: [String: JSONValue]) {
        guard let id = json["node_id"]?.stringValue else { return nil }
        self.id = id
        self.parentId = json["parent_id"]?.stringValue
        self.depth = json["depth"]?.intValue ?? 0
        self.title = json["title"]?.stringValue ?? "(未命名)"
        self.anchorSummary = json["anchor_summary"]?.stringValue ?? ""
        self.segmentCount = json["segment_count"]?.intValue ?? 0
        self.segments = (json["segments"]?.arrayValue ?? []).compactMap { SegmentDTO(json: $0.objectValue ?? [:]) }
    }

    public init(id: String, parentId: String?, depth: Int, title: String, anchorSummary: String, segmentCount: Int, segments: [SegmentDTO]) {
        self.id = id; self.parentId = parentId; self.depth = depth; self.title = title
        self.anchorSummary = anchorSummary; self.segmentCount = segmentCount; self.segments = segments
    }
}
