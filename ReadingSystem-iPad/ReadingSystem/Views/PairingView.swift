// PairingView.swift — 首次配对：Bonjour/手动地址 + 6 位 SAS 风格配对码
import SwiftUI

struct PairingView: View {
    @ObservedObject var conn: BridgeConnection
    @ObservedObject var sync: SyncEngine
    @Environment(\.dismiss) private var dismiss

    @State private var pairingCode = ""
    @State private var manualHost = ""
    @State private var manualPort = "8732"
    @State private var useManual = false

    private var statusText: String {
        if conn.state == .ready { return "已连接到 Mac" }
        if let err = conn.lastError { return err }
        switch conn.state {
        case .connected: return "已连上 Mac（未配对）"
        case .connecting: return "正在建立 WebSocket 连接…"
        case .discovering: return "正在通过 Bonjour 发现 Mac（_readingsystem._tcp）…"
        default: return "正在通过 Bonjour 发现 Mac（_readingsystem._tcp）…"
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("连接 Mac") {
                    HStack {
                        Image(systemName: conn.state == .ready ? "checkmark.circle.fill" : "antenna.radiowaves.left.and.right")
                            .foregroundStyle(conn.state == .ready ? .green : .secondary)
                        Text(statusText)
                            .font(.footnote)
                    }
                    Toggle("Bonjour 不可用？手动输入 IP", isOn: $useManual)
                    if useManual {
                        TextField("Mac 的局域网 IP（如 192.168.1.5）", text: $manualHost)
                            .keyboardType(.decimalPad)
                        TextField("端口（默认 8732）", text: $manualPort)
                            .keyboardType(.numberPad)
                        Button("连接") {
                            conn.connectDirect(host: manualHost, port: UInt16(manualPort) ?? 8732)
                        }
                        .disabled(manualHost.isEmpty)
                    }
                }
                Section("配对码") {
                    Text("在 Mac 上运行：node bin/readingsystem.mjs pair \"我的iPad\"，把显示的 6 位数字填到这里。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    TextField("6 位配对码", text: $pairingCode)
                        .keyboardType(.numberPad)
                    Button("配对") {
                        sync.pair(code: pairingCode, name: UIDevice.current.name)
                    }
                    .disabled(pairingCode.count != 6 || !(conn.state == .connected || conn.state == .paired || conn.state == .ready))
                    if conn.state == .connected {
                        Text("✓ 已连上 Mac，输入配对码即可")
                            .font(.footnote).foregroundStyle(.green)
                    }
                }
                Section {
                    Button("稍后再说（离线也能读缓存）") { dismiss() }
                }
            }
            .navigationTitle("配对 Mac")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") { dismiss() }
                }
            }
            .onChange(of: conn.state) { _, newState in
                if newState == .ready { dismiss() }
            }
        }
    }
}
