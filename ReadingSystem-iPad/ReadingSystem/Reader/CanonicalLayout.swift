// CanonicalLayout.swift — LayoutProfile 与 Ink 布局锁定（Phase A：单一坐标系 + 旧 Ink 不 reflow）
// 规则（运行库 02_PhaseA/04_LayoutProfile锁定）：
//   annotationRevision == 0 → 可用最新 LayoutProfile（新 Entity）
//   annotationRevision > 0  → 锁定原 profile / layoutEpoch，字体/margin 变化不迁移旧 Ink
// 旋转/分屏只改外层 viewport；body canonical width 在布局时锁定。

import Foundation
import UIKit

public struct LayoutProfile: Codable, Equatable, Sendable {
    /// profile 语义 id（如 "pdf30" = 每行约30字、留白4.5%）
    public var profileID: String
    /// 该 Entity 锁定的正文宽度（Canonical Body width, points）
    public var canonicalWidth: CGFloat
    /// 该 Entity 锁定的正文字号
    public var fontSize: CGFloat
    /// 该 Entity 锁定的左右留白
    public var horizontalMargin: CGFloat
    /// 单调递增布局代次
    public var epoch: Int

    public init(profileID: String, canonicalWidth: CGFloat, fontSize: CGFloat, horizontalMargin: CGFloat, epoch: Int) {
        self.profileID = profileID
        self.canonicalWidth = canonicalWidth
        self.fontSize = fontSize
        self.horizontalMargin = horizontalMargin
        self.epoch = epoch
    }

    /// 序列化为 layoutEpoch 存储串（向后兼容：旧数据没有 profile → legacy）
    public func encodedEpoch() -> String {
        let data = (try? JSONEncoder().encode(self)) ?? Data()
        return String(data: data, encoding: .utf8) ?? "legacy"
    }

    public static func decode(epochString: String?) -> LayoutProfile? {
        guard let s = epochString, let data = s.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(LayoutProfile.self, from: data)
    }

    /// legacy：本次修复前旧代码的几何（动态 = 4.5% 留白 + 每行30字），没有锁定能力。
    /// 旧 Ink 存在时，我们用"当前可见正确几何"快照锁成一个 epoch，永不自动迁移。
    public static func legacySnapshot(viewportWidth: CGFloat) -> LayoutProfile {
        let margin = max(24, viewportWidth * 0.045)
        let width = max(320, viewportWidth - margin * 2)
        let font = min(width / 30, 34)
        return LayoutProfile(profileID: "legacy-frozen", canonicalWidth: width, fontSize: font, horizontalMargin: margin, epoch: 1)
    }

    /// 新 Entity 布局：PDF 参照（30字/行、留白4.5%）
    public static func fresh(viewportWidth: CGFloat, epoch: Int) -> LayoutProfile {
        let margin = max(24, viewportWidth * 0.045)
        let width = max(320, viewportWidth - margin * 2)
        let font = min(width / 30, 34)
        return LayoutProfile(profileID: "pdf30", canonicalWidth: width, fontSize: font, horizontalMargin: margin, epoch: epoch)
    }
}

/// Ink 布局锁定决策（纯逻辑，便于测试）
public enum LayoutLock {
    /// entity 是否已有任何 annotation（revision > 0）
    public static func profile(
        forExistingAnnotation annotationRevision: Int,
        storedEpoch: String?,
        storedProfile: LayoutProfile?,
        viewportWidth: CGFloat,
        currentEpoch: Int
    ) -> LayoutProfile {
        // 已有 annotation：必须锁定（优先用已存 profile；没有则把当前可见几何快照成 legacy）
        if annotationRevision > 0 {
            if let p = storedProfile { return p }
            return .legacySnapshot(viewportWidth: viewportWidth)
        }
        // 无 annotation：采用最新布局（首笔落定后会随 annotation 一起持久化 epoch）
        return .fresh(viewportWidth: viewportWidth, epoch: currentEpoch)
    }
}
