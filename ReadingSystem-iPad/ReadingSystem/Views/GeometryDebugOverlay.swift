// GeometryDebugOverlay.swift — Phase A: Debug 几何诊断层
// GeometryDebugData 始终可用（避免 #if DEBUG 穿透函数签名）
// GeometryDebugOverlay View 仅 Debug build 可见；Release 完全隐藏

import SwiftUI
import PencilKit

// 始终定义（避免 #if DEBUG 穿透函数参数签名）
struct GeometryDebugData {
    let canvasFrame: CGRect
    let canvasBounds: CGRect
    let canvasContentSize: CGSize
    let canvasContentOffset: CGPoint
    let canvasContentInset: UIEdgeInsets
    let canvasZoomScale: CGFloat
    let canvasTransform: CGAffineTransform
    let bodySize: CGSize
    let profileId: String

    static var placeholder: GeometryDebugData {
        GeometryDebugData(
            canvasFrame: .zero, canvasBounds: .zero, canvasContentSize: .zero,
            canvasContentOffset: .zero, canvasContentInset: .zero,
            canvasZoomScale: 1, canvasTransform: .identity,
            bodySize: .zero, profileId: "unknown"
        )
    }
}

#if DEBUG
struct GeometryDebugOverlay: View {
    let data: GeometryDebugData

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Geometry Debug")
                .font(.system(size: 11, weight: .semibold))
            Text("profile: \(data.profileId)")
            Text("body: \(fmt(data.bodySize.width))x\(fmt(data.bodySize.height))")
            Text("canvas frame: \(fmt(data.canvasFrame.width))x\(fmt(data.canvasFrame.height))")
            Text("canvas bounds: \(fmt(data.canvasBounds.width))x\(fmt(data.canvasBounds.height))")
            Text("contentSize: \(fmt(data.canvasContentSize.width))x\(fmt(data.canvasContentSize.height))")
            Text("contentOffset: (\(fmt(data.canvasContentOffset.x)), \(fmt(data.canvasContentOffset.y)))")
            Text("contentInset: (\(fmt(data.canvasContentInset.top)),\(fmt(data.canvasContentInset.left)),\(fmt(data.canvasContentInset.bottom)),\(fmt(data.canvasContentInset.right)))")
            Text("zoomScale: \(String(format: "%.3f", data.canvasZoomScale))")
            Text("transform: \(transformString(data.canvasTransform))")
        }
        .font(.system(size: 9, design: .monospaced))
        .foregroundStyle(.red)
        .padding(8)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 6))
        .allowsHitTesting(false)
    }

    private func fmt(_ v: CGFloat) -> String { String(Int(v.rounded())) }
    private func transformString(_ t: CGAffineTransform) -> String {
        if t == .identity { return "identity" }
        return "NON-IDENTITY"
    }
}

extension View {
    @ViewBuilder
    func geometryDebugOverlay(enabled: Bool, data: GeometryDebugData?) -> some View {
        if enabled, let data {
            self.overlay(alignment: .topLeading) {
                GeometryDebugOverlay(data: data)
                    .padding(.top, 4)
                    .padding(.leading, 4)
            }
        }
    }
}
#endif
