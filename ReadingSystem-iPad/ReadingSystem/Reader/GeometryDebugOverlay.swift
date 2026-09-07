// GeometryDebugOverlay.swift — Debug-only 几何诊断层（运行库 02_PhaseA/06）
// Release 完全隐藏。当任何未来 layout 变更重新破坏坐标时可立即看到。

import UIKit
import PencilKit

/// 类型常驻编译（保证两种配置都能链接）；仅 Debug 构建 attach 到视图（Release 完全隐藏）。
final class GeometryDebugOverlay: UIView {
    private let label = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor.black.withAlphaComponent(0.55)
        layer.cornerRadius = 8
        label.textColor = .systemGreen
        label.font = .monospacedSystemFont(ofSize: 9, weight: .medium)
        label.numberOfLines = 0
        label.translatesAutoresizingMaskIntoConstraints = false
        addSubview(label)
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: topAnchor, constant: 6),
            label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 6),
            label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -6),
            label.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -6),
        ])
        widthAnchor.constraint(lessThanOrEqualToConstant: 240).isActive = true
    }

    required init?(coder: NSCoder) { fatalError() }

    func update(profile: LayoutProfile?, canvas: PKCanvasView, viewport: UIScrollView, bodyView: UIView, hover: Bool) {
        var s = ""
        if let p = profile {
            s += "profile: \(p.profileID) ep\(p.epoch)\n"
            s += String(format: "bodyW %.0f font %.1f\n", p.canonicalWidth, p.fontSize)
        }
        s += String(format: "canvas f %.0f×%.0f b %.0f×%.0f\n", canvas.frame.width, canvas.frame.height, canvas.bounds.width, canvas.bounds.height)
        s += String(format: "cSize %.0f×%.0f off %.0f ins %.0f zoom %.2f\n",
                    canvas.contentSize.width, canvas.contentSize.height,
                    canvas.contentOffset.y, canvas.contentInset.top, canvas.zoomScale)
        s += String(format: "vp zoom %.2f offY %.0f\n", viewport.zoomScale, viewport.contentOffset.y)
        s += hover ? "✏️ hover ACTIVE（几何冻结）" : "hover off"
        label.text = s
        let target = label.sizeThatFits(CGSize(width: 240, height: CGFloat.greatestFiniteMagnitude))
        frame.size = CGSize(width: target.width + 12, height: target.height + 12)
    }
}
