// LayoutProfile.swift — Phase A: 字体/边距/行距的不可变快照
// 规则：annotationRevision > 0 时锁定原 LayoutProfile，防止已有 Ink reflow
// 新字体/新 margin 仅用于未批注 Entity 或新 Entity
// 用户想看大 → 通过 Reader viewport zoom，不 scale PKDrawing

import SwiftUI

struct LayoutProfile: Equatable, Hashable {
    let id: String           // "fp_{fontSize}_{margin}" 作为 layoutEpoch 标识
    let fontSize: CGFloat
    let margin: CGFloat
    let lineSpacing: CGFloat

    static func current(for viewportWidth: CGFloat) -> LayoutProfile {
        let margin = max(24, viewportWidth * 0.045)
        let fontSize = min(viewportWidth * 0.91 / 30, 34)
        return LayoutProfile(
            id: "fp_\(Int(fontSize.rounded()))_\(Int(margin.rounded()))",
            fontSize: fontSize,
            margin: margin,
            lineSpacing: fontSize * 0.55
        )
    }
}
