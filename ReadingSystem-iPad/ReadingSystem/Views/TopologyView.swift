// TopologyView.swift — ContentGraph 空间导航（dev.ipad_topology）
// root Block 居中心；Node 是圆，大小只由内容量决定（sqrt scale）；edge 统一中性无语义；
// single tap → Anchor Card（不改 Focus）；double tap → NODE_VIEW；drag → USER_PINNED（只改 presentation 坐标）。
// v1 禁止：typed edges、cross-graph links、自动 clustering、Interest 大小。

import SwiftUI

struct TopologyLayoutNode: Identifiable {
    let id: String
    let parentId: String?
    let title: String
    let anchorSummary: String
    let depth: Int
    let contentAmount: Double   // sqrt(字符数)
    var position: CGSize
    var pinned: Bool
}

struct TopologyView: View {
    let snapshot: ContentSnapshot?
    let graphId: String?
    let layoutRevision: Int
    let pinnedPositions: [ClientStore.PinnedPosition]
    let onEnterNode: (String) -> Void
    let onEnterBlock: () -> Void
    let onPin: (String, Double, Double) -> Void

    @State private var zoom: CGFloat = 1.0
    @State private var pan: CGSize = .zero
    @State private var lastPan: CGSize = .zero
    @State private var lastZoom: CGFloat = 1.0
    @State private var selected: TopologyLayoutNode?
    @State private var layoutNodes: [TopologyLayoutNode] = []
    @State private var builtForRevision: Int = -1

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Canvas { context, _ in
                    guard !layoutNodes.isEmpty else { return }
                    // edges：root 在中心，node → parent；统一中性线条
                    var path = Path()
                    let byId = Dictionary(uniqueKeysWithValues: layoutNodes.map { ($0.id, $0) })
                    let root = layoutNodes.first(where: { $0.depth == 0 })
                    for node in layoutNodes where node.depth > 0 {
                        let parent = node.parentId.flatMap { byId[$0] } ?? root
                        guard let parent else { continue }
                        let from = transform(node.position, geo.size)
                        let to = transform(parent.position, geo.size)
                        path.move(to: from)
                        path.addLine(to: to)
                    }
                    context.stroke(path, with: .color(.gray.opacity(0.5)), lineWidth: 1.2)
                }
                .allowsHitTesting(false)

                ForEach(layoutNodes) { node in
                    circle(for: node, canvas: geo.size)
                }
            }
            .contentShape(Rectangle())
            .gesture(panGesture)
            .simultaneousGesture(zoomGesture)
            .onTapGesture { selected = nil }
            .onChange(of: pinnedPositions) { _, newPos in
                applyPins()
            }
            .onChange(of: snapshot?.graphRevision) { _, _ in
                rebuild(canvas: geo.size)
            }
            .onAppear { rebuild(canvas: geo.size) }
            .overlay(alignment: .bottom) { anchorCard }
        }
        .navigationTitle("内容图")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func transform(_ p: CGSize, _ canvas: CGSize) -> CGPoint {
        let center = CGPoint(x: canvas.width / 2, y: canvas.height / 2)
        return CGPoint(
            x: center.x + (p.width * zoom) + pan.width,
            y: center.y + (p.height * zoom) + pan.height)
    }

    private func circle(for node: TopologyLayoutNode, canvas: CGSize) -> some View {
        let pos = transform(node.position, canvas)
        let radius = nodeRadius(node)
        let isRoot = node.depth == 0
        return Circle()
            .fill(isRoot ? AnyShapeStyle(Color.accentColor.opacity(0.85)) : AnyShapeStyle(Color.secondary.opacity(0.25)))
            .frame(width: radius * 2, height: radius * 2)
            .overlay(
                Text(node.title)
                    .font(isRoot ? .footnote.bold() : .caption2)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .foregroundColor(isRoot ? .white : .primary)
                    .padding(6)
            )
            .position(pos)
            .onTapGesture(count: 2) {
                selected = nil
                if isRoot { onEnterBlock() } else { onEnterNode(node.id) }
            }
            .onTapGesture(count: 1) {
                // single tap：Anchor Card，只改 SelectedNode，不改 Focus
                selected = node
            }
            .gesture(
                DragGesture()
                    .onChanged { value in
                        if var updated = layoutNodes.first(where: { $0.id == node.id }) {
                            updated.position = CGSize(width: node.position.width + value.translation.width / zoom,
                                                      height: node.position.height + value.translation.height / zoom)
                            if let idx = layoutNodes.firstIndex(where: { $0.id == node.id }) {
                                layoutNodes[idx] = updated
                            }
                        }
                    }
                    .onEnded { value in
                        let final = CGSize(width: node.position.width + value.translation.width / zoom,
                                           height: node.position.height + value.translation.height / zoom)
                        if let idx = layoutNodes.firstIndex(where: { $0.id == node.id }) {
                            layoutNodes[idx].position = final
                            layoutNodes[idx].pinned = true
                        }
                        // drag 只改 presentation 坐标，绝不改 parent；end → USER_PINNED
                        if let gid = graphId {
                            onPin(node.id, Double(final.width), Double(final.height))
                        }
                    }
            )
    }

    /// 大小只由 content amount 决定：sqrt scaling + clamp
    private func nodeRadius(_ node: TopologyLayoutNode) -> CGFloat {
        let base = sqrt(max(node.contentAmount, 120))
        let clamped = min(max(base, 34), 78)
        return clamped * (node.depth == 0 ? 1.15 : 1.0) // root bonus
    }

    private var panGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                pan = CGSize(width: lastPan.width + value.translation.width,
                             height: lastPan.height + value.translation.height)
            }
            .onEnded { _ in lastPan = pan }
    }

    private var zoomGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                zoom = min(max(lastZoom * value, 0.3), 3.0)
            }
            .onEnded { _ in lastZoom = zoom }
    }

    /// rooted radial 布局：root 中心，node 按深度环形分布；CREATE 只影响 AUTO 节点的初始位（USER_PINNED 不动）
    private func rebuild(canvas: CGSize) {
        guard let snap = snapshot, builtForRevision != snap.graphRevision else { return }
        builtForRevision = snap.graphRevision
        var nodes: [TopologyLayoutNode] = []
        let root = TopologyLayoutNode(
            id: snap.rootBlockId, parentId: nil, title: snap.rootBlockTitle ?? "（无标题）",
            anchorSummary: snap.rootBlockSummary ?? "", depth: 0, contentAmount: Double(snap.rootBlockContent.count),
            position: .zero, pinned: true)
        nodes.append(root)

        let byDepth = Dictionary(grouping: snap.nodes, by: \.depth)
        for (depth, group) in byDepth {
            let ring = Double(depth) * 150.0 + 120.0
            for (i, dto) in group.sorted(by: { $0.id < $1.id }).enumerated() {
                let angle = (Double(i) / Double(max(group.count, 1))) * 2 * .pi + Double(depth) * 0.6
                let chars = dto.segments.reduce(0) { $0 + $1.text.count }
                nodes.append(TopologyLayoutNode(
                    id: dto.id, parentId: dto.parentId, title: dto.title, anchorSummary: dto.anchorSummary,
                    depth: dto.depth, contentAmount: Double(max(chars, dto.anchorSummary.count)),
                    position: CGSize(width: cos(angle) * ring, height: sin(angle) * ring),
                    pinned: false))
            }
        }
        layoutNodes = nodes
        applyPins()
    }

    private func applyPins() {
        for pin in pinnedPositions {
            if let idx = layoutNodes.firstIndex(where: { $0.id == pin.nodeId }) {
                layoutNodes[idx].position = CGSize(width: pin.x, height: pin.y)
                layoutNodes[idx].pinned = true
            }
        }
    }

    @ViewBuilder
    private var anchorCard: some View {
        if let node = selected {
            VStack(alignment: .leading, spacing: 6) {
                Text(node.title).font(.headline)
                Text(node.anchorSummary.isEmpty ? "（暂无 Anchor Summary）" : node.anchorSummary)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                HStack {
                    if node.depth > 0 {
                        Button("进入节点") { selected = nil; onEnterNode(node.id) }
                            .buttonStyle(.borderedProminent)
                    } else {
                        Button("阅读原文") { selected = nil; onEnterBlock() }
                            .buttonStyle(.borderedProminent)
                    }
                    Spacer()
                    Button("关闭") { selected = nil }
                        .buttonStyle(.bordered)
                }
            }
            .padding(14)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
            .padding()
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}
