// RootView.swift — App Shell：状态横幅 + Topology / Reader 切换 + 配对界面
// RootState 语义：本地优先；断开 READY → 离线缓存可读，不回空白首页。

import SwiftUI

struct RootView: View {
    @ObservedObject var sync: SyncEngine
    @ObservedObject var conn: BridgeConnection
    @State private var viewKind: String = "TOPOLOGY_VIEW"
    @State private var currentNodeId: String?
    @State private var showPairing = false
    @State private var annotationData: ReaderAnnotationData? = nil
    @Environment(\.scenePhase) private var scenePhase

    private var currentEntityId: String? {
        if viewKind == "NODE_VIEW" { return currentNodeId }
        if viewKind == "BLOCK_VIEW" { return sync.snapshot?.rootBlockId }
        return nil
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewKind == "TOPOLOGY_VIEW" {
                    TopologyView(
                        snapshot: sync.snapshot,
                        graphId: sync.graphId,
                        layoutRevision: 0,
                        pinnedPositions: [],
                        onEnterNode: { nodeId in
                            currentNodeId = nodeId
                            enter(viewKind: "NODE_VIEW", entityId: nodeId)
                        },
                        onEnterBlock: { enter(viewKind: "BLOCK_VIEW", entityId: sync.snapshot?.rootBlockId) },
                        onPin: { nodeId, x, y in
                            if let gid = sync.graphId {
                                Task { await sync.savePinnedPosition(graphId: gid, nodeId: nodeId, x: x, y: y) }
                            }
                        })
                } else {
                    ReaderView(
                        graphId: sync.graphId ?? "",
                        viewKind: viewKind,
                        entity: sync.snapshot?.nodes.first(where: { $0.id == currentNodeId }),
                        snapshot: sync.snapshot,
                        annotation: annotationData,
                        onDrawingChange: { entityId, data, layoutEpoch in
                            if let gid = sync.graphId {
                                Task { await sync.saveAnnotation(graphId: gid, entityId: entityId,
                                                                  drawingData: data, layoutEpoch: layoutEpoch) }
                            }
                        })
                        .task(id: currentEntityId) {
                            // 进入 Entity 时装载本地批注（含布局锁定信息）
                            if let entityId = currentEntityId {
                                annotationData = await sync.loadAnnotation(entityId: entityId)
                            }
                        }
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        // RETURN_TOPOLOGY：回当前 Graph topology（本地优先）
                        if let gid = sync.graphId {
                            enter(viewKind: "TOPOLOGY_VIEW", entityId: nil, graphId: gid)
                        }
                    } label: {
                        Image(systemName: "circle.hexagongrid.circle")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    stateBadge
                }
            }
            .sheet(isPresented: $showPairing) {
                PairingView(conn: conn, sync: sync)
            }
            .navigationDestination(isPresented: .constant(false)) { EmptyView() }
        }
        .onChange(of: scenePhase) { _, phase in
            // 后台：强制 flush outbox（durable 数据早已落盘）；回前台：自动重连
            if phase == .active {
                sync.reconnectIfNeeded()
            } else {
                sync.flushOutbox()
            }
        }
        .onAppear {
            sync.reconnectIfNeeded() // 启动即自动重连（记住的地址 > Bonjour）
            if conn.state == .disconnected, conn.lastError == nil, sync.snapshot == nil {
                showPairing = true
            }
        }
    }

    private var stateBadge: some View {
        Button { showPairing = true } label: {
            HStack(spacing: 4) {
                Circle()
                    .fill(conn.state == .ready ? Color.green : (conn.state == .offline || conn.state == .disconnected ? Color.orange : Color.yellow))
                    .frame(width: 8, height: 8)
                Text(shortStatus).font(.caption)
            }
        }
    }

    private var shortStatus: String {
        switch conn.state {
        case .ready: return "Mac 已连接"
        case .paired, .connected: return "已连上 Mac"
        case .connecting, .discovering: return "连接中…"
        case .offline: return "离线（可读缓存）"
        case .disconnected: return "未连接"
        }
    }

    /// 本地优先导航：双击即本地进入并持久化 ViewState（store.commitView），再发 ViewCommitted
    private func enter(viewKind kind: String, entityId: String?, graphId: String? = nil) {
        viewKind = kind
        currentNodeId = entityId
        if let gid = graphId ?? sync.graphId {
            Task {
                await sync.commitLocalView(graphId: gid, viewKind: kind, entityId: entityId)
            }
        }
        // Entity 切换：清空旧 annotation，等待新装载
        annotationData = nil
    }
}

#Preview {
    let store = try! ClientStore(path: NSTemporaryDirectory() + "preview.sqlite")
    RootView(sync: SyncEngine(store: store), conn: BridgeConnection())
}
