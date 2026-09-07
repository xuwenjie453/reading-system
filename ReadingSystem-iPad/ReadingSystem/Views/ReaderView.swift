// ReaderView.swift — Reader 薄 SwiftUI 壳（Phase A 重构后）
// 真正的阅读几何由 ReaderCanvasViewController（UIKit 单一坐标系）承担；
// 本壳只负责：数据传入、Toolbar 开关笔迹层、Entity 切换。
// 「新增内容 ↓」提示由 UIKit 控制器在正文底部追加后自行展示。

import SwiftUI
import UIKit

struct ReaderView: View {
    let graphId: String
    let viewKind: String                 // BLOCK_VIEW | NODE_VIEW
    let entity: NodeDTO?                 // NODE_VIEW 时的焦点节点
    let snapshot: ContentSnapshot?
    let annotation: ReaderAnnotationData?
    let onDrawingChange: (String, Data, String) -> Void   // entityId, data, layoutEpoch

    @State private var showInk = true

    private var bodyTextForView: String {
        if viewKind == "NODE_VIEW", let node = entity {
            return node.segments.sorted(by: { $0.ordinal < $1.ordinal }).map { $0.text }.joined(separator: "\n\n")
        }
        return snapshot?.rootBlockContent ?? ""
    }

    private var headerTitle: String {
        viewKind == "NODE_VIEW" ? (entity?.title ?? "节点") : (snapshot?.rootBlockTitle ?? "")
    }
    private var headerSummary: String? {
        viewKind == "NODE_VIEW" ? entity?.anchorSummary : nil
    }

    var body: some View {
        ReaderCanvas(
            headerTitle: headerTitle,
            headerSummary: headerSummary,
            bodyText: bodyTextForView,
            annotation: annotation,
            showInk: showInk,
            onDrawingChange: onDrawingChange
        )
        .navigationTitle(viewKind == "NODE_VIEW" ? (entity?.title ?? "节点") : "原文")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(showInk ? "隐藏笔迹" : "显示笔迹") { showInk.toggle() }
            }
        }
    }
}

// MARK: - UIKit 包装（单一坐标系 Reader）

private struct ReaderCanvas: UIViewControllerRepresentable {
    let headerTitle: String
    let headerSummary: String?
    let bodyText: String
    let annotation: ReaderAnnotationData?
    let showInk: Bool
    let onDrawingChange: (String, Data, String) -> Void

    func makeUIViewController(context: Context) -> ReaderCanvasViewController {
        let vc = ReaderCanvasViewController()
        vc.onDrawingChange = { id, data, epoch in
            onDrawingChange(id, data, epoch)
        }
        // 首轮数据注入（等 UIKit 视图就绪）
        DispatchQueue.main.async { [weak vc] in
            guard let vc else { return }
            vc.headerTitle = headerTitle
            vc.headerSummary = headerSummary
            vc.showInk = showInk
            vc.bodyText = bodyText
            vc.annotation = annotation
        }
        return vc
    }

    func updateUIViewController(_ vc: ReaderCanvasViewController, context: Context) {
        vc.headerTitle = headerTitle
        vc.headerSummary = headerSummary
        vc.showInk = showInk
        // EXTEND 新 segment 到达 → didSet → 安全点追加（hover/stroke 冻结由控制器处理）
        if vc.bodyText != bodyText { vc.bodyText = bodyText }
        // annotation 数据异步装载完成后切换 Entity
        if vc.annotation?.entityId != annotation?.entityId {
            vc.annotation = annotation
        }
    }
}
