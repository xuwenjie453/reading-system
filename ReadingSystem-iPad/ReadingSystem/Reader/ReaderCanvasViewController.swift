// ReaderCanvasViewController.swift — Phase A：单一 Canonical Coordinate Space
//
// 层级（运行库 02_PhaseA/03_单一坐标系重构）：
//   ReaderCanvasViewController
//   └── ReaderViewportScrollView (外层滚动/zoom 唯一 owner)
//       └── CanonicalDocumentView
//           ├── MetadataHeaderView          (Title/Summary；不进 Ink 平面)
//           └── CanonicalBodyView           (几何真源)
//               ├── TextSurface (UITextView 只读 selectable)
//               └── PKCanvasView            (identity；scroll 关；contentSize == bounds)
//
// 不变量：
//   canvas.transform == .identity / zoomScale == 1 / contentOffset == .zero /
//   contentInset == .zero / canvas.frame.size == body.bounds.size
//   font/margin 只影响 LayoutProfile；旧 Ink 绝不 reflow；旋转只改 viewport。
//   hover/stroke 期间不做任何几何更新（queue 到安全点）。

import UIKit
import PencilKit

// MARK: - Annotation 装载数据

public struct ReaderAnnotationData: Sendable {
    public let entityId: String
    public let bundle: ClientStore.AnnotationBundle?   // nil = 该 Entity 无历史笔迹

    public init(entityId: String, bundle: ClientStore.AnnotationBundle?) {
        self.entityId = entityId
        self.bundle = bundle
    }
}

final class ReaderCanvasViewController: UIViewController {
    // MARK: 输入
    var headerTitle: String = ""
    var headerSummary: String?
    var bodyText: String = "" {
        didSet {
            if oldValue != bodyText {
                applyTextUpdateIfSafe()
                showNewContentHintIfNeeded()
            }
        }
    }
    var annotation: ReaderAnnotationData? {
        didSet { if oldValue?.entityId != annotation?.entityId { applyAnnotationIfSafe() } }
    }
    var showInk: Bool = true {
        didSet { canvas.isHidden = !showInk }
    }
    /// EXTEND 视觉追加是否已排队等待（hover 结束后应用）
    private(set) var pendingVisualAppend = false
    var onDrawingChange: ((String, Data, String) -> Void)?   // entityId, data, layoutEpoch
    private(set) var layoutProfile: LayoutProfile?

    // MARK: 层级
    private let viewport = UIScrollView()
    private let documentView = UIView()
    private let headerView = UIView()
    private let headerTitleLabel = UILabel()
    private let headerSummaryLabel = UILabel()
    private let bodyView = UIView()          // CanonicalBodyView：几何真源
    private let textView = UITextView()      // TextSurface
    private let canvas = PKCanvasView()             // Ink Layer（identity）

    // MARK: 状态
    private var isHoverActive = false
    private var hasQueuedTextUpdate = false
    private var layoutIsLocked = false       // 有 Ink 后锁定 layout（旋转/改字号不 reflow）
    private var viewportWidthForLayout: CGFloat = 0
    private var annotationRevision = 0
    private let writableBottomInset: CGFloat = 140   // 正文最后一行下方固定可写余量（不随内容增长）
    private let layoutEpochNow = 1

    // MARK: EXTEND 提示（追加发生在安全点；用户不在底部时显示「新增内容 ↓」）
    private let newContentButton = UIButton(type: .system)

    // MARK: Debug
    private var debugOverlay: GeometryDebugOverlay?

    // MARK: - 生命周期
    override func viewDidLoad() {
        super.viewDidLoad()
        buildHierarchy()
        #if DEBUG
        debugOverlay = GeometryDebugOverlay()
        if let overlay = debugOverlay {
            overlay.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(overlay)
            NSLayoutConstraint.activate([
                overlay.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 4),
                overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -4),
            ])
        }
        #endif
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        layoutNewContentButton()
        // 旋转/尺寸变化：viewport 适配；正文几何只有在"无 Ink 且未锁定"时允许重新 layout
        let newWidth = view.bounds.width
        if abs(newWidth - viewportWidthForLayout) > 1 {
            if layoutIsLocked || annotationRevision > 0 {
                layoutCentered()          // 锁定：body 宽度不变，只居中（无 reflow）
            } else {
                layoutDocument()          // 全新/未落笔：允许最新 profile
            }
        }
    }

    private func layoutNewContentButton() {
        newContentButton.frame = CGRect(x: view.bounds.width - 150,
                                        y: view.bounds.height - view.safeAreaInsets.bottom - 60,
                                        width: 130, height: 40)
    }

    // MARK: - 层级构建
    private func buildHierarchy() {
        view.backgroundColor = .systemBackground

        viewport.translatesAutoresizingMaskIntoConstraints = false
        viewport.contentInsetAdjustmentBehavior = .never
        viewport.isDirectionalLockEnabled = true
        view.addSubview(viewport)

        documentView.translatesAutoresizingMaskIntoConstraints = false
        viewport.addSubview(documentView)

        // Header（不进入 Ink 坐标平面）
        headerTitleLabel.font = .preferredFont(forTextStyle: .title3).withSize(20)
        headerTitleLabel.numberOfLines = 0
        headerSummaryLabel.font = .preferredFont(forTextStyle: .footnote)
        headerSummaryLabel.textColor = .secondaryLabel
        headerSummaryLabel.numberOfLines = 0

        // Body（CanonicalBodyView）
        textView.isEditable = false
        textView.isSelectable = true
        textView.isScrollEnabled = false          // Text 不滚动：高度 = 内容高
        textView.textContainerInset = .zero
        textView.textContainer.lineFragmentPadding = 0
        textView.backgroundColor = .clear
        textView.textColor = .label

        canvas.drawingPolicy = .pencilOnly        // 落笔即写；finger 留给外层滚动/选择
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.isScrollEnabled = false
        canvas.alwaysBounceVertical = false
        canvas.alwaysBounceHorizontal = false
        canvas.contentInsetAdjustmentBehavior = .never
        canvas.delegate = self

        documentView.addSubview(headerView)
        documentView.addSubview(bodyView)
        // 「新增内容 ↓」提示按钮（EXTEND 后显示；点击滚动到底部；不参与正文 layout）
        newContentButton.configuration = {
            var c = UIButton.Configuration.filled()
            c.cornerStyle = .capsule
            c.title = "新增内容 ↓"
            c.baseBackgroundColor = .systemGray
            c.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12)
            return c
        }()
        newContentButton.alpha = 0
        newContentButton.addTarget(self, action: #selector(scrollToBottom), for: .touchUpInside)
        view.addSubview(newContentButton)
        headerView.addSubview(headerTitleLabel)
        headerView.addSubview(headerSummaryLabel)
        bodyView.addSubview(textView)
        bodyView.addSubview(canvas)

        // hover 检测（iOS 17+ Pencil hover）：hover 期间冻结几何更新
        let hover = UIHoverGestureRecognizer(target: self, action: #selector(hoverChanged(_:)))
        hover.cancelsTouchesInView = false
        view.addGestureRecognizer(hover)

        constrainViewport()
    }

    private func constrainViewport() {
        // 滚动区避开 navigation bar / 底部指示条（正文从 0 开始滚动，不受 inset 影响）
        NSLayoutConstraint.activate([
            viewport.topAnchor.constraint(equalTo: view.topAnchor),
            viewport.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            viewport.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            viewport.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
    }

    // MARK: - 布局（手动 frame；几何完全可审计）

    private func currentProfile() -> LayoutProfile {
        if let p = layoutProfile { return p }
        return LayoutProfile.fresh(viewportWidth: viewport.bounds.width, epoch: layoutEpochNow)
    }

    /// 全新内容 / 未落笔旋转：完整 layout
    private func layoutDocument() {
        let vw = viewport.bounds.width
        viewportWidthForLayout = vw
        let annotationRev = annotation?.bundle?.revision ?? 0
        let profile: LayoutProfile
        if annotationRev > 0, let stored = storedProfile() {
            profile = stored
            layoutIsLocked = true
        } else if annotationRev > 0 {
            profile = .legacySnapshot(viewportWidth: vw)
            layoutIsLocked = true
        } else {
            profile = .fresh(viewportWidth: vw, epoch: layoutEpochNow)
            layoutIsLocked = false
        }
        layoutProfile = profile
        applyProfileLayout(profile)
    }

    /// 有 Ink 锁定后的旋转/尺寸变化：body 宽不变，只重排居中与高度
    private func layoutCentered() {
        guard let profile = layoutProfile else { layoutDocument(); return }
        let vw = viewport.bounds.width
        viewportWidthForLayout = vw
        applyProfileLayout(profile)
    }

    private func storedProfile() -> LayoutProfile? {
        guard let epochStr = annotation?.bundle?.layoutEpoch else { return nil }
        return LayoutProfile.decode(epochString: epochStr)
    }

    private func applyProfileLayout(_ profile: LayoutProfile) {
        let vw = max(viewport.bounds.width, 1)
        let textHeight = textHeight(for: profile.canonicalWidth, fontSize: profile.fontSize)

        // Header 高度（Title + 可选 Summary 折叠展示用：Summary 统一显示，可被点击收起——v1 简化：都显示）
        headerTitleLabel.text = headerTitle
        headerSummaryLabel.text = headerSummary
        headerSummaryLabel.isHidden = headerSummary == nil
        let titleH = headerTitle.isEmpty ? 0 : headerTitleLabel.sizeThatFits(CGSize(width: profile.canonicalWidth, height: .greatestFiniteMagnitude)).height
        let summaryH = headerSummaryLabel.isHidden ? 0 : headerSummaryLabel.sizeThatFits(CGSize(width: profile.canonicalWidth, height: .greatestFiniteMagnitude)).height
        let headerH = (headerTitle.isEmpty && headerSummaryLabel.isHidden ? 0 : titleH + summaryH + 22)

        // document / header / body 布局（body 宽 = 锁定 canonicalWidth，居中）
        let docW = max(vw, profile.canonicalWidth)
        let bodyX = (vw - profile.canonicalWidth) / 2
        let bodyH = textHeight + writableBottomInset

        documentView.frame = CGRect(x: 0, y: 0, width: docW, height: headerH + bodyH)
        headerView.frame = CGRect(x: bodyX, y: 0, width: profile.canonicalWidth, height: headerH)
        headerTitleLabel.frame = CGRect(x: 0, y: 6, width: profile.canonicalWidth, height: titleH)
        headerSummaryLabel.frame = CGRect(x: 0, y: titleH + 10, width: profile.canonicalWidth, height: summaryH)
        bodyView.frame = CGRect(x: bodyX, y: headerH, width: profile.canonicalWidth, height: bodyH)

        textView.font = .systemFont(ofSize: profile.fontSize)
        textView.frame = bodyView.bounds

        // Canvas：几何真源同 frame；contentSize == bounds；identity（hard constraint 断言见 debugAssertGeometry）
        canvas.frame = bodyView.bounds
        canvas.contentSize = bodyView.bounds.size

        viewport.contentSize = documentView.frame.size
        viewport.zoomScale = 1.0
        viewport.setZoomScale(1.0, animated: false)
        viewport.contentInset = .zero

        debugAssertGeometry()
        debugOverlay?.update(profile: profile, canvas: canvas, viewport: viewport, bodyView: bodyView, hover: isHoverActive)
    }

    private func textHeight(for width: CGFloat, fontSize: CGFloat) -> CGFloat {
        textView.font = .systemFont(ofSize: fontSize)
        textView.text = bodyText
        let size = textView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return max(size.height, 1)
    }

    // MARK: - 更新入口（EXTEND / 新 Entity / 首笔后锁定）

    private func applyTextUpdateIfSafe() {
        // hover/stroke 活动期间只排队；安全点后应用（运行库 07_Hover与Stroke竞态）
        if isHoverActive {
            hasQueuedTextUpdate = true
            return
        }
        guard let profile = layoutProfile else { return }
        // 文本追加只在底部增长高度；宽度/原点不变 → 旧 Ink 不移动
        let h = textHeight(for: profile.canonicalWidth, fontSize: profile.fontSize)
        var f = bodyView.frame
        f.size.height = h + writableBottomInset
        bodyView.frame = f
        textView.frame = bodyView.bounds
        canvas.frame = bodyView.bounds
        canvas.contentSize = bodyView.bounds.size
        var df = documentView.frame
        df.size.height = bodyView.frame.maxY
        documentView.frame = df
        viewport.contentSize = documentView.frame.size
        debugAssertGeometry()
        debugOverlay?.update(profile: profile, canvas: canvas, viewport: viewport, bodyView: bodyView, hover: isHoverActive)
    }

    private func applyAnnotationIfSafe() {
        guard let ann = annotation else { return }
        if ann.bundle != nil {
            // 有历史笔迹：layout 必须按已存 profile（或 legacy 快照）锁定
            annotationRevision = ann.bundle?.revision ?? 0
        }
        layoutDocument()
        loadDrawing(ann)
    }

    private func loadDrawing(_ ann: ReaderAnnotationData) {
        if let bundle = ann.bundle {
            if let drawing = try? PKDrawing(data: bundle.drawing) {
                canvas.drawing = drawing
            }
        } else {
            canvas.drawing = PKDrawing()
        }
        // 首笔落定前的快照：无历史笔迹且当前无 stroke → 可自由 layout
    }

    // MARK: - hover 处理
    @objc private func hoverChanged(_ g: UIHoverGestureRecognizer) {
        let wasActive = isHoverActive
        switch g.state {
        case .began, .changed:
            isHoverActive = true
        default:
            isHoverActive = false
            if hasQueuedTextUpdate {
                hasQueuedTextUpdate = false
                applyTextUpdateIfSafe()
            }
        }
        if wasActive != isHoverActive {
            debugOverlay?.update(profile: currentProfile(), canvas: canvas, viewport: viewport, bodyView: bodyView, hover: isHoverActive)
        }
    }

    // MARK: - EXTEND 提示
    private func showNewContentHintIfNeeded() {
        guard bodyText.count > 0 else { return }
        UIView.animate(withDuration: 0.25) { self.newContentButton.alpha = 1 }
    }

    @objc func scrollToBottom() {
        UIView.animate(withDuration: 0.25) { self.newContentButton.alpha = 0 }
        let bottom = CGPoint(x: 0, y: max(0, viewport.contentSize.height - viewport.bounds.height))
        viewport.setContentOffset(bottom, animated: true)
    }

    // MARK: - Debug
    func debugAssertGeometry() {
        #if DEBUG
        assert(canvas.transform == .identity, "canvas transform 必须为 identity")
        assert(abs(canvas.zoomScale - 1) < 0.001, "canvas zoomScale 必须为 1")
        assert(canvas.contentOffset == .zero, "canvas contentOffset 必须为 zero")
        assert(canvas.contentInset == .zero, "canvas contentInset 必须为 zero")
        assert(abs(canvas.frame.width - bodyView.bounds.width) < 0.5, "canvas 宽 != body 宽")
        assert(abs(canvas.contentSize.width - bodyView.bounds.width) < 0.5, "canvas contentSize 宽 != body 宽")
        #endif
    }
}

// MARK: - PKCanvasViewDelegate（保存时带上当前 layoutEpoch → Ink 布局永久锁定）

extension ReaderCanvasViewController: PKCanvasViewDelegate {
    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        guard let entityId = annotation?.entityId else { return }
        // 首笔出现 → 立即锁定 layout（若之前未锁定）
        if !layoutIsLocked && !canvas.drawing.strokes.isEmpty {
            layoutIsLocked = true
        }
        let profile = currentProfile()
        let data = canvas.drawing.dataRepresentation()
        onDrawingChange?(entityId, data, profile.encodedEpoch())
        debugOverlay?.update(profile: profile, canvas: canvas, viewport: viewport, bodyView: bodyView, hover: isHoverActive)
    }
}
