// ReadingSystemApp.swift — iPad 客户端入口
// 冷启动顺序：恢复本地缓存（离线可读）→ 恢复 pending Pencil/outbox → 尝试连接。
import SwiftUI

@main
struct ReadingSystemApp: App {
    @StateObject private var conn = BridgeConnection()
    @StateObject private var sync: SyncEngine

    init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let store = try! ClientStore(path: dir.appendingPathComponent("readingsystem-client.sqlite").path)
        _sync = StateObject(wrappedValue: SyncEngine(store: store))
    }

    var body: some Scene {
        WindowGroup {
            RootView(sync: sync, conn: conn)
                .onAppear {
                    sync.attach(conn)
                    conn.discover()
                }
        }
    }
}
