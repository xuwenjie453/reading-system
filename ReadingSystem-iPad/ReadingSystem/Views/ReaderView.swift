// ReaderView.swift — Block/Node 共用 Reader（dev.ipad_reader）
// 页面层级：Chrome → Document Viewport → Metadata Header + Canonical Body Surface（Text Layer + Ink Layer）。
// Header 与 Body 坐标分离：Header 高度变化不移动 Body 原点（viewport anchor compensation 由 ScrollView 保持）。
// continuous vertical canvas、固定 canonical width；EXTEND 只在底部 append；
// 用户不在底部时不 auto-scroll，显示「新增内容 ↓」；滚到底绝不自动 END。

import SwiftUI
import PencilKit

struct ReaderView: View {
    let graphId: String
    let viewKind: String                 // BLOCK_VIEW | NODE_VIEW
    let entity: NodeDTO?                 // NODE_VIEW 时的焦点节点
    let snapshot: ContentSnapshot?
    let previousSegmentCount: Int
    let annotationHandler: (String, Data) -> Void   // entityId, PKDrawing data

    @State private var showInk = true
    @State private var lastSegmentCount = 0
    @State private var hasNewContent = false

    var body: some View {
        GeometryReader { geo in
            let margin = max(24, geo.size.width * 0.045)            // 两侧留白 ≈ 4.5%（参照 PDF）
            let fontSize = min(geo.size.width * 0.91 / 30, 34)      // 每行 ≈ 30 字（参照 PDF 18pt 正文）
            ScrollViewReader { proxy in
                readerBody(margin: margin, fontSize: fontSize, proxy: proxy)
            }
        }
    }

    private func readerBody(margin: CGFloat, fontSize: CGFloat, proxy: ScrollViewProxy) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                bodySurface(margin: margin, fontSize: fontSize)
                    .id("body-bottom")
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if hasNewContent {
                Button {
                    hasNewContent = false
                    withAnimation { proxy.scrollTo("body-bottom", anchor: .bottom) }
                } label: {
                    Label("新增内容", systemImage: "arrow.down.circle")
                        .font(.footnote)
                        .padding(10)
                        .background(.thinMaterial, in: Capsule())
                }
                .padding()
                // 只有用户本来就在底部附近才自动跟随；否则保持 viewport（不 auto-scroll）
                .onAppear { hasNewContent = true }
            }
        }
    }

    /// Metadata Header：Title + Anchor Summary（与 Body 坐标平面分离，不进 Ink 坐标系）
    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            if viewKind == "NODE_VIEW" {
                Text(entity?.title ?? "").font(.title3.bold())
                if let s = entity?.anchorSummary, !s.isEmpty {
                    DisclosureGroup("Anchor Summary") {
                        Text(s).font(.footnote).foregroundStyle(.secondary)
                    }
                    .font(.footnote)
                }
            } else {
                Text(snapshot?.rootBlockTitle ?? "").font(.title3.bold())
                // Fresh Block 不突出系统 Summary：默认不展示 Block Anchor Summary
            }
            Divider()
        }
        .padding(.horizontal)
        .padding(.top, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Canonical Body Surface：Text Layer + Ink Layer 叠加；固定 canonical width
    private func bodySurface(margin: CGFloat, fontSize: CGFloat) -> some View {
        let bodyText = bodyTextForView
        return ZStack(alignment: .topLeading) {
            // Text Layer：selectable / searchable
            Text(bodyText.isEmpty ? "（内容同步中…）" : bodyText)
                .font(.system(size: fontSize))
                .textSelection(.enabled)
                .lineSpacing(fontSize * 0.55)
                .padding(.vertical, 20)
            if showInk {
                // Ink Layer：Pencil 落笔即写（pencilOnly；finger 留给滚动/选择）
                InkLayerView(entityId: entityIdForInk, onDrawingChange: { data in
                    annotationHandler(entityIdForInk, data)
                })
                .transition(.opacity)
            }
        }
        .padding(.horizontal, margin)  // 留白参照 PDF ≈ 4.5%；rotation 只改 viewport transform
        .frame(maxWidth: .infinity, alignment: .center)
    }

    private var entityIdForInk: String {
        viewKind == "NODE_VIEW" ? (entity?.id ?? "") : (snapshot?.rootBlockId ?? "")
    }

    /// Node Body：Segment 按序拼接（连续自然文章，不显示 Segment ID、不用聊天气泡）；
    /// 旧 Segment 文本永不改写（append-only 的阅读面）。
    private var bodyTextForView: String {
        if viewKind == "NODE_VIEW", let node = entity {
            return node.segments.sorted(by: { $0.ordinal < $1.ordinal }).map { $0.text }.joined(separator: "\n\n")
        }
        return snapshot?.rootBlockContent ?? ""
    }
}

// MARK: - Ink Layer（PencilKit 直写）

struct InkLayerView: UIViewRepresentable {
    let entityId: String
    let onDrawingChange: (Data) -> Void

    func makeUIView(context: Context) -> PKCanvasView {
        let canvas = PKCanvasView()
        canvas.drawingPolicy = .pencilOnly      // Pencil 落笔即写；finger 留给 scroll/selection
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.delegate = context.coordinator
        // 锁死画布内部滚动：PKCanvasView 是 UIScrollView，内部 offset 一旦变化，
        // 笔迹会相对正文整体漂移（表现为笔尖靠近错位、移开复位）。坐标必须恒定。
        canvas.isScrollEnabled = false
        canvas.alwaysBounceVertical = false
        canvas.alwaysBounceHorizontal = false
        canvas.contentInsetAdjustmentBehavior = .never
        canvas.contentInset = .zero
        canvas.contentOffset = .zero
        canvas.showsVerticalScrollIndicator = false
        canvas.showsHorizontalScrollIndicator = false
        // 关闭悬停（Pencil hover）手势对绘图的干扰
        DispatchQueue.main.async {
            for g in canvas.gestureRecognizers ?? [] {
                if String(describing: type(of: g)).lowercased().contains("hover") {
                    g.isEnabled = false
                }
            }
        }
        // 恢复本地已保存笔迹（PKDrawing vector 是真源）
        if let annotation = context.coordinator.store?.loadAnnotationSync(entityId: entityId) {
            canvas.drawing = (try? PKDrawing(data: annotation)) ?? PKDrawing()
        }
        context.coordinator.canvas = canvas
        return canvas
    }

    func updateUIView(_ canvas: PKCanvasView, context: Context) {
        if context.coordinator.entityId != entityId {
            context.coordinator.entityId = entityId
            context.coordinator.canvas = canvas
            context.coordinator.reloadDrawing()
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(entityId: entityId, onDrawingChange: onDrawingChange) }

    final class Coordinator: NSObject, PKCanvasViewDelegate {
        var entityId: String
        var canvas: PKCanvasView?
        var onDrawingChange: (Data) -> Void
        var store: LocalAnnotationCache? = LocalAnnotationCache.shared
        private var saveTimer: Timer?

        init(entityId: String, onDrawingChange: @escaping (Data) -> Void) {
            self.entityId = entityId
            self.onDrawingChange = onDrawingChange
        }

        func reloadDrawing() {
            guard let canvas else { return }
            if let data = store?.loadAnnotationSync(entityId: entityId) {
                canvas.drawing = (try? PKDrawing(data: data)) ?? PKDrawing()
            } else {
                canvas.drawing = PKDrawing()
            }
        }

        /// debounce 只优化 I/O；页面离开/后台强制 flush（ScenePhase 由外层处理 flushOutbox）
        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            saveTimer?.invalidate()
            saveTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: false) { [weak self] _ in
                guard let self, let canvas = self.canvas else { return }
                let data = canvas.drawing.dataRepresentation()
                self.store?.cache(entityId: self.entityId, data: data)
                self.onDrawingChange(data)
            }
        }
    }
}

/// 进程内笔迹缓存：同步读取（避免 async 穿透 UIViewRepresentable）
final class LocalAnnotationCache {
    static let shared = LocalAnnotationCache()
    private var cache: [String: Data] = [:]
    func cache(entityId: String, data: Data) { cache[entityId] = data }
    func loadAnnotationSync(entityId: String) -> Data? { cache[entityId] }
}
