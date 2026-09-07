// ReaderView.swift — Block/Node 共用 Reader（Phase A + Phase B）
// 单一 Canonical Coordinate Space：TextSurface 与 PKCanvasView 同 frame/origin
//
// 视图层级：
// GeometryReader → ScrollView → VStack → header + CanonicalBodyView
//   CanonicalBodyView = ZStack(.topLeading) { TextSurface + PKCanvasView }
//   padding 在 ZStack 外层 → Text 和 Canvas 共享同一坐标原点
//   InkToolbar 是 screen overlay，不参与 CanonicalDocument layout
//
// Phase A 修复：
// 1. Text 和 Canvas 共享 padding/origin
// 2. PKCanvasView: identity transform, zoomScale=1, contentOffset=zero
// 3. LayoutProfile 锁定（有 Ink 时锁定）
// 4. Hover/Stroke 期间布局冻结
// 5. Debug 几何断言 + overlay
//
// Phase B 工具系统：
// 6. InkToolController 唯一工具状态真源
// 7. 圆形按钮 + 纵向 palette + 属性面板
// 8. Apple Pencil 双击（UIPencilInteraction）
// 9. stroke active 时工具切换排队

import SwiftUI
import PencilKit

struct ReaderView: View {
    let graphId: String
    let viewKind: String
    let entity: NodeDTO?
    let snapshot: ContentSnapshot?
    let previousSegmentCount: Int
    let annotationHandler: (String, Data) -> Void

    @State private var showInk = true
    @State private var lastSegmentCount = 0
    @State private var hasNewContent = false

    // Phase A: LayoutProfile 锁定
    @State private var lockedProfile: LayoutProfile?

    // Phase A: Hover/Stroke 期间布局冻结 gate
    @State private var isPencilActive = false

    // Phase B: 工具状态唯一真源
    @StateObject private var inkTool = InkToolController()

    #if DEBUG
    @State private var debugData: GeometryDebugData?
    @State private var showDebugOverlay = false
    #endif

    var body: some View {
        GeometryReader { geo in
            let profile = lockedProfile ?? LayoutProfile.current(for: geo.size.width)
            ScrollViewReader { proxy in
                readerBody(profile: profile, proxy: proxy)
            }
        }
    }

    private func readerBody(profile: LayoutProfile, proxy: ScrollViewProxy) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                canonicalBodySurface(profile: profile)
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
                .onAppear { hasNewContent = true }
            }
        }
        // Phase B: 工具工具栏 overlay（不参与正文 layout）
        .overlay(alignment: .bottomTrailing) {
            InkToolbar(controller: inkTool)
        }
        // Phase B: 属性面板 overlay
        .overlay(alignment: .bottom) {
            if inkTool.attributesExpanded, inkTool.activeTool.isWritingTool {
                InkAttributesPanel(controller: inkTool)
                    .padding(.bottom, 70)
                    .transition(.opacity)
            }
        }
        #if DEBUG
        .geometryDebugOverlay(enabled: showDebugOverlay, data: debugData)
        #endif
    }

    /// Metadata Header：Title + Anchor Summary
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
            }
            Divider()
        }
        .padding(.horizontal)
        .padding(.top, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Canonical Body Surface：Text + Ink 叠加，共享坐标原点
    private func canonicalBodySurface(profile: LayoutProfile) -> some View {
        let bodyText = bodyTextForView
        return ZStack(alignment: .topLeading) {
            Text(bodyText.isEmpty ? "（内容同步中…）" : bodyText)
                .font(.system(size: profile.fontSize))
                .textSelection(.enabled)
                .lineSpacing(profile.lineSpacing)

            if showInk {
                InkLayerView(
                    entityId: entityIdForInk,
                    tool: inkTool.currentPKTool,
                    toolVersion: inkTool.toolVersion,
                    onDrawingChange: { data in
                        annotationHandler(entityIdForInk, data)
                    },
                    onInkPresenceChanged: { hasInk in
                        if hasInk && lockedProfile == nil {
                            lockedProfile = profile
                        }
                    },
                    onStrokeStateChange: { active in
                        isPencilActive = active
                        // stroke 结束 → 应用排队的工具切换
                        if !active {
                            inkTool.flushPending()
                        }
                    },
                    onDoubleTap: {
                        inkTool.handle(.doubleTapEraser, strokeActive: isPencilActive)
                    },
                    isPencilActive: $isPencilActive,
                    onGeometryUpdate: debugGeometryHandler
                )
                .transition(.opacity)
            }
        }
        .padding(.horizontal, profile.margin)
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity, alignment: .center)
    }

    private var entityIdForInk: String {
        viewKind == "NODE_VIEW" ? (entity?.id ?? "") : (snapshot?.rootBlockId ?? "")
    }

    private var bodyTextForView: String {
        if viewKind == "NODE_VIEW", let node = entity {
            return node.segments.sorted(by: { $0.ordinal < $1.ordinal }).map { $0.text }.joined(separator: "\n\n")
        }
        return snapshot?.rootBlockContent ?? ""
    }

    private var debugGeometryHandler: ((GeometryDebugData) -> Void)? {
        #if DEBUG
        return { data in debugData = data }
        #else
        return nil
        #endif
    }
}

// MARK: - Ink Layer（PencilKit 直写）

struct InkLayerView: UIViewRepresentable {
    let entityId: String
    let tool: PKTool
    let toolVersion: Int
    let onDrawingChange: (Data) -> Void
    let onInkPresenceChanged: (Bool) -> Void
    let onStrokeStateChange: (Bool) -> Void
    let onDoubleTap: () -> Void
    @Binding var isPencilActive: Bool
    let onGeometryUpdate: ((GeometryDebugData) -> Void)?

    init(
        entityId: String,
        tool: PKTool,
        toolVersion: Int,
        onDrawingChange: @escaping (Data) -> Void,
        onInkPresenceChanged: @escaping (Bool) -> Void,
        onStrokeStateChange: @escaping (Bool) -> Void,
        onDoubleTap: @escaping () -> Void,
        isPencilActive: Binding<Bool>,
        onGeometryUpdate: ((GeometryDebugData) -> Void)? = nil
    ) {
        self.entityId = entityId
        self.tool = tool
        self.toolVersion = toolVersion
        self.onDrawingChange = onDrawingChange
        self.onInkPresenceChanged = onInkPresenceChanged
        self.onStrokeStateChange = onStrokeStateChange
        self.onDoubleTap = onDoubleTap
        self._isPencilActive = isPencilActive
        self.onGeometryUpdate = onGeometryUpdate
    }

    func makeUIView(context: Context) -> PKCanvasView {
        let canvas = PKCanvasView()
        canvas.drawingPolicy = .pencilOnly
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.delegate = context.coordinator

        // Phase A: 锁死画布内部 scroll/zoom
        canvas.isScrollEnabled = false
        canvas.alwaysBounceVertical = false
        canvas.alwaysBounceHorizontal = false
        canvas.contentInsetAdjustmentBehavior = .never
        canvas.contentInset = .zero
        canvas.contentOffset = .zero
        canvas.minimumZoomScale = 1
        canvas.maximumZoomScale = 1
        canvas.zoomScale = 1
        canvas.transform = .identity
        canvas.showsVerticalScrollIndicator = false
        canvas.showsHorizontalScrollIndicator = false

        // Phase B: 应用初始工具
        canvas.tool = tool

        // Phase B: Apple Pencil double tap（UIPencilInteraction）
        context.coordinator.installPencilInteraction(on: canvas)

        // Phase A: 恢复本地已保存笔迹
        if let annotation = context.coordinator.store?.loadAnnotationSync(entityId: entityId) {
            canvas.drawing = (try? PKDrawing(data: annotation)) ?? PKDrawing()
            if !canvas.drawing.strokes.isEmpty {
                onInkPresenceChanged(true)
            }
        }
        context.coordinator.canvas = canvas

        #if DEBUG
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            context.coordinator.reportGeometry()
        }
        #endif

        return canvas
    }

    func updateUIView(_ canvas: PKCanvasView, context: Context) {
        if context.coordinator.entityId != entityId {
            context.coordinator.entityId = entityId
            context.coordinator.canvas = canvas
            context.coordinator.reloadDrawing()
        }
        // Phase B: 工具版本变化 → 更新 canvas.tool（stroke active 时已被上层排队）
        if context.coordinator.toolVersion != toolVersion {
            context.coordinator.toolVersion = toolVersion
            canvas.tool = tool
        }
        // Phase A: 强制锁定几何不变量
        if canvas.zoomScale != 1 { canvas.zoomScale = 1 }
        if canvas.transform != .identity { canvas.transform = .identity }
        if canvas.contentOffset != .zero { canvas.contentOffset = .zero }
        if canvas.contentInset != .zero { canvas.contentInset = .zero }

        #if DEBUG
        context.coordinator.reportGeometry()
        #endif
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(
            entityId: entityId,
            toolVersion: toolVersion,
            onDrawingChange: onDrawingChange,
            onInkPresenceChanged: onInkPresenceChanged,
            onStrokeStateChange: onStrokeStateChange,
            onDoubleTap: onDoubleTap,
            isPencilActive: $isPencilActive,
            onGeometryUpdate: onGeometryUpdate
        )
    }

    final class Coordinator: NSObject, PKCanvasViewDelegate, UIPencilInteractionDelegate {
        var entityId: String
        var toolVersion: Int
        var canvas: PKCanvasView?
        var onDrawingChange: (Data) -> Void
        var onInkPresenceChanged: (Bool) -> Void
        var onStrokeStateChange: (Bool) -> Void
        var onDoubleTap: () -> Void
        @Binding var isPencilActive: Bool
        var store: LocalAnnotationCache? = LocalAnnotationCache.shared
        private var saveTimer: Timer?
        private var hadInk = false
        var onGeometryUpdate: ((GeometryDebugData) -> Void)?

        init(
            entityId: String,
            toolVersion: Int,
            onDrawingChange: @escaping (Data) -> Void,
            onInkPresenceChanged: @escaping (Bool) -> Void,
            onStrokeStateChange: @escaping (Bool) -> Void,
            onDoubleTap: @escaping () -> Void,
            isPencilActive: Binding<Bool>,
            onGeometryUpdate: ((GeometryDebugData) -> Void)?
        ) {
            self.entityId = entityId
            self.toolVersion = toolVersion
            self.onDrawingChange = onDrawingChange
            self.onInkPresenceChanged = onInkPresenceChanged
            self.onStrokeStateChange = onStrokeStateChange
            self.onDoubleTap = onDoubleTap
            self._isPencilActive = isPencilActive
            self.onGeometryUpdate = onGeometryUpdate
        }

        func reloadDrawing() {
            guard let canvas else { return }
            if let data = store?.loadAnnotationSync(entityId: entityId) {
                canvas.drawing = (try? PKDrawing(data: data)) ?? PKDrawing()
            } else {
                canvas.drawing = PKDrawing()
            }
        }

        // MARK: - Pencil double tap

        func installPencilInteraction(on canvas: PKCanvasView) {
            let interaction = UIPencilInteraction()
            interaction.delegate = self
            interaction.isEnabled = true
            canvas.addInteraction(interaction)
        }

        func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
            // 系统 Pencil double tap → 交给上层（InkToolController 处理 switchEraser）
            onDoubleTap()
        }

        // MARK: - Stroke state（Phase A gate + Phase B 工具切换排队）

        func canvasViewDidBeginUsingTool(_ canvasView: PKCanvasView) {
            isPencilActive = true
            onStrokeStateChange(true)
        }

        func canvasViewDidEndUsingTool(_ canvasView: PKCanvasView) {
            isPencilActive = false
            onStrokeStateChange(false)
        }

        // MARK: - Drawing change

        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            let hasInk = !canvasView.drawing.strokes.isEmpty
            if hasInk && !hadInk {
                hadInk = true
                onInkPresenceChanged(true)
            }

            saveTimer?.invalidate()
            saveTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: false) { [weak self] _ in
                guard let self, let canvas = self.canvas else { return }
                let data = canvas.drawing.dataRepresentation()
                self.store?.cache(entityId: self.entityId, data: data)
                self.onDrawingChange(data)
            }

            #if DEBUG
            reportGeometry()
            #endif
        }

        #if DEBUG
        func reportGeometry() {
            guard let canvas else { return }
            let data = GeometryDebugData(
                canvasFrame: canvas.frame,
                canvasBounds: canvas.bounds,
                canvasContentSize: canvas.contentSize,
                canvasContentOffset: canvas.contentOffset,
                canvasContentInset: canvas.contentInset,
                canvasZoomScale: canvas.zoomScale,
                canvasTransform: canvas.transform,
                bodySize: canvas.superview?.bounds.size ?? .zero,
                profileId: "canvas"
            )
            onGeometryUpdate?(data)

            assert(canvas.transform == .identity, "PKCanvasView transform must be identity")
            assert(abs(canvas.zoomScale - 1) < 0.001, "PKCanvasView zoomScale must be 1")
            assert(canvas.contentOffset == .zero, "PKCanvasView contentOffset must be zero")
            assert(canvas.contentInset == .zero, "PKCanvasView contentInset must be zero")
        }
        #else
        func reportGeometry() {}
        #endif
    }
}

/// 进程内笔迹缓存：同步读取
final class LocalAnnotationCache {
    static let shared = LocalAnnotationCache()
    private var cache: [String: Data] = [:]
    func cache(entityId: String, data: Data) { cache[entityId] = data }
    func loadAnnotationSync(entityId: String) -> Data? { cache[entityId] }
}
