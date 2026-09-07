// BridgeConnection.swift — Bonjour 发现 + WebSocket 传输（URLSessionWebSocketTask + NWBrowser）
// 配对/重连/会话建立；低层收发，可靠性语义在 SyncEngine。

import Foundation
import Network

public final class BridgeConnection: NSObject, ObservableObject {
    @Published public private(set) var state: ConnState = .disconnected
    @Published public private(set) var lastError: String?

    public enum ConnState: Equatable, Sendable {
        case disconnected, discovering, connecting, connected, paired, ready, offline
    }

    public var onEnvelope: ((BridgeEnvelope) -> Void)?
    public var onConnected: (() -> Void)?    // WS 通道就绪（含重连）；已配对设备据此恢复会话
    private var webSocket: URLSessionWebSocketTask?
    private lazy var session = URLSession(configuration: .default)
    private var browser: NWBrowser?
    private var endpointHost: String?
    private var endpointPort: UInt16 = 0

    public override init() {
        super.init()
    }

    // MARK: - Bonjour 发现（_readingsystem._tcp）
    public func discover() {
        state = .discovering
        let params = NWParameters()
        params.includePeerToPeer = true
        let browser = NWBrowser(for: .bonjour(type: "_readingsystem._tcp.", domain: nil), using: params)
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            guard let self, let result = results.first else { return }
            // 只在尚未建立连接时响应首次发现；结果集变化不再触发重连（避免连接风暴）
            guard self.webSocket == nil, self.endpointHost == nil,
                  self.state == .discovering || self.state == .offline else { return }
            if case let .service(name, type, domain, _) = result.endpoint {
                self.resolveAndConnect(name: name, type: type, domain: domain, interface: result.interfaces.first)
            }
        }
        browser.stateUpdateHandler = { [weak self] newState in
            if case .failed(let error) = newState {
                self?.lastError = "Bonjour 失败: \(error)"
                self?.state = .disconnected
            }
        }
        browser.start(queue: .main)
        self.browser = browser
    }

    /// 手动直连（同一 Wi-Fi 下输入 Mac 的 IP；Bonjour 被防火墙拦截时的后备路径）
    public func connectDirect(host: String, port: UInt16) {
        endpointHost = host
        endpointPort = port
        openWebSocket()
    }

    private func resolveAndConnect(name: String, type: String, domain: String, interface: NWInterface?) {
        let params = NWParameters()
        params.includePeerToPeer = true
        let endpoint = NWEndpoint.service(name: name, type: type, domain: domain, interface: interface)
        let connection = NWConnection(to: endpoint, using: params)
        connection.stateUpdateHandler = { [weak self] newState in
            switch newState {
            case .ready:
                // 从已解析的 endpoint 提取 host/port（Bonjour 服务在此刻已解析为 hostPort）
                if case let .hostPort(host, port) = connection.endpoint {
                    self?.endpointHost = Self.hostString(host)
                    self?.endpointPort = UInt16(port.rawValue)
                }
                // 用解析出的 host/port 建立 WebSocket（复用 URLSession 能力）
                self?.openWebSocket()
                connection.cancel()
            case .failed(let error):
                self?.lastError = "解析失败: \(error)"
            default:
                break
            }
        }
        connection.start(queue: .main)
    }

    static func hostString(_ host: NWEndpoint.Host) -> String {
        switch host {
        case .ipv4(let addr): return "\(addr)"
        case .ipv6(let addr): return "\(addr)"
        case .name(let name, _): return name
        @unknown default: return ""
        }
    }

    public func openWebSocket() {
        guard let host = endpointHost, endpointPort > 0 else {
            lastError = "没有可用地址"
            return
        }
        if webSocket != nil, state == .connected || state == .paired || state == .ready {
            return // 已有可用连接
        }
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        state = .connecting
        guard let url = URL(string: "ws://\(host):\(endpointPort)/bridge") else { return }
        let task = session.webSocketTask(with: url)
        webSocket = task
        resumeReceive(task)
        task.resume()
        // 握手完成后验证通道：成功 → 已连接（未配对）；失败 → 给出具体原因
        let capturedHost = host
        let capturedPort = Int(endpointPort)
        task.sendPing { [weak self] error in
            DispatchQueue.main.async {
                guard let self else { return }
                if error == nil {
                    self.state = .connected
                    self.lastError = nil
                    self.browser?.cancel()
                    self.browser = nil
                    self.onConnected?() // 触发会话恢复（SESSION_CONNECT）
                    // 记住这个地址：之后每次启动/回前台自动重连，不再需要手动输入
                    UserDefaults.standard.set(capturedHost, forKey: "rs.lastHost")
                    UserDefaults.standard.set(capturedPort, forKey: "rs.lastPort")
                } else {
                    self.lastError = "连接失败: \(error!.localizedDescription)"
                    self.state = .offline
                    self.scheduleRetry()
                }
            }
        }
    }

    /// 启动 / 回前台 / 掉线时调用：优先用记住的地址直连，其次 Bonjour 发现
    public func autoReconnect() {
        if state == .ready || state == .connecting || state == .connected || state == .paired { return }
        let host = UserDefaults.standard.string(forKey: "rs.lastHost")
        let port = UserDefaults.standard.object(forKey: "rs.lastPort") as? Int
        if let host, let port {
            connectDirect(host: host, port: UInt16(port))
        } else {
            discover()
        }
    }

    private func scheduleRetry() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
            guard let self, self.state == .offline || self.state == .disconnected else { return }
            self.autoReconnect()
        }
    }

    private func resumeReceive(_ task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let message):
                if case .string(let text) = message,
                   let data = text.data(using: .utf8),
                   let env = try? JSONDecoder().decode(BridgeEnvelope.self, from: data) {
                    DispatchQueue.main.async { self.onEnvelope?(env) }
                }
                self.resumeReceive(task)
            case .failure(let error):
                DispatchQueue.main.async {
                    self.lastError = "连接断开: \(error.localizedDescription)"
                    self.state = .offline
                    self.scheduleRetry() // 掉线自动重连，不等用户操作
                }
            }
        }
    }

    public func send(_ envelope: BridgeEnvelope) {
        guard let data = try? JSONEncoder().encode(envelope),
              let text = String(data: data, encoding: .utf8) else { return }
        webSocket?.send(.string(text)) { [weak self] error in
            if error != nil {
                DispatchQueue.main.async { self?.state = .offline }
            }
        }
    }

    public func markReady() { state = .ready }
    public func markPaired() { state = .paired }

    public func disconnect() {
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        state = .disconnected
    }
}
