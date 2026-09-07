// InkToolController.swift — Phase B: 书写工具唯一状态真源
// 所有工具变化统一走: Toolbar tap / Double tap → InkToolAction → InkToolController → @Published 状态 → SwiftUI 重渲染 → canvas.tool
// 禁止任何 View 长期维护自己的 selectedTool 真源
// 每种 writing tool 独立记忆 color/width；previousAnyTool ≠ previousWritingTool
// toolVersion 每次工具/样式变化递增，驱动 InkLayerView 更新 canvas.tool

import SwiftUI
import PencilKit

// MARK: - 工具类型

enum InkToolKind: String, CaseIterable, Codable, Identifiable {
    case pen
    case pencil
    case highlighter
    case eraser
    case lasso

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .pen: return "钢笔"
        case .pencil: return "铅笔"
        case .highlighter: return "荧光笔"
        case .eraser: return "橡皮"
        case .lasso: return "套索"
        }
    }

    var systemImage: String {
        switch self {
        case .pen: return "pencil.tip"
        case .pencil: return "pencil"
        case .highlighter: return "highlighter"
        case .eraser: return "eraser.fill"
        case .lasso: return "lasso"
        }
    }

    var isWritingTool: Bool {
        self == .pen || self == .pencil || self == .highlighter
    }
}

// MARK: - 工具样式

struct InkToolStyle: Codable, Equatable {
    var red: Double
    var green: Double
    var blue: Double
    var width: Double

    var color: UIColor {
        UIColor(red: red, green: green, blue: blue, alpha: 1)
    }

    var colorSwiftUI: Color {
        Color(red: red, green: green, blue: blue)
    }

    static let defaultPen = InkToolStyle(red: 0.05, green: 0.05, blue: 0.05, width: 2.5)
    static let defaultPencil = InkToolStyle(red: 0.35, green: 0.35, blue: 0.35, width: 3.5)
    static let defaultHighlighter = InkToolStyle(red: 1.0, green: 0.85, blue: 0.2, width: 12.0)
}

// MARK: - 工具动作

enum InkToolAction {
    case select(InkToolKind)
    case togglePalette
    case closePalette
    case movePalette(side: PaletteSide, verticalPosition: Double)
    case doubleTapEraser
    case doubleTapPrevious
}

enum PaletteSide: String, Codable {
    case leading
    case trailing
}

// MARK: - InkToolController

@MainActor
final class InkToolController: ObservableObject {
    @Published var activeTool: InkToolKind = .pen
    @Published private(set) var previousAnyTool: InkToolKind = .pen
    @Published private(set) var previousWritingTool: InkToolKind = .pen
    @Published var paletteExpanded: Bool = false
    @Published var attributesExpanded: Bool = false
    @Published var paletteSide: PaletteSide = .trailing
    @Published var paletteVerticalPosition: Double = 0.5

    // 每种 writing tool 独立记忆 color/width
    @Published var penStyle: InkToolStyle = .defaultPen
    @Published var pencilStyle: InkToolStyle = .defaultPencil
    @Published var highlighterStyle: InkToolStyle = .defaultHighlighter

    // toolVersion 每次工具/样式变化递增，驱动 InkLayerView 更新 canvas.tool
    @Published private(set) var toolVersion: Int = 0

    // stroke active 期间暂存的动作
    private var pendingAction: InkToolAction?

    private let defaults = UserDefaults.standard

    init() {
        restoreFromDefaults()
    }

    // MARK: - 当前 PKTool

    var currentPKTool: PKTool {
        switch activeTool {
        case .pen: return PKInkingTool(.pen, color: penStyle.color, width: penStyle.width)
        case .pencil: return PKInkingTool(.pencil, color: pencilStyle.color, width: pencilStyle.width)
        case .highlighter: return PKInkingTool(.marker, color: highlighterStyle.color, width: highlighterStyle.width)
        case .eraser: return PKEraserTool(.bitmap)
        case .lasso: return PKLassoTool()
        }
    }

    var currentStyle: InkToolStyle? {
        switch activeTool {
        case .pen: return penStyle
        case .pencil: return pencilStyle
        case .highlighter: return highlighterStyle
        default: return nil
        }
    }

    // MARK: - 统一动作入口

    func handle(_ action: InkToolAction, strokeActive: Bool) {
        // stroke active 时，工具切换排队到 drawingDidEnd
        if strokeActive, case .select = action {
            pendingAction = action
            return
        }
        apply(action)
    }

    /// drawingDidEnd 时调用：应用排队的工具切换
    func flushPending() {
        if let action = pendingAction {
            pendingAction = nil
            apply(action)
        }
    }

    private func apply(_ action: InkToolAction) {
        switch action {
        case .select(let kind):
            selectTool(kind)
        case .togglePalette:
            paletteExpanded.toggle()
        case .closePalette:
            paletteExpanded = false
            attributesExpanded = false
        case .movePalette(let side, let pos):
            paletteSide = side
            paletteVerticalPosition = pos
            persist()
        case .doubleTapEraser:
            doubleTapToEraser()
        case .doubleTapPrevious:
            doubleTapToPrevious()
        }
    }

    // MARK: - 工具选择

    private func selectTool(_ kind: InkToolKind) {
        if kind == activeTool && kind.isWritingTool {
            // 再次点击当前 writing tool → 展开属性（而非无动作）
            paletteExpanded = false
            attributesExpanded = true
            return
        }
        if activeTool != kind {
            previousAnyTool = activeTool
        }
        if kind.isWritingTool {
            previousWritingTool = kind
        }
        activeTool = kind
        paletteExpanded = false
        attributesExpanded = false
        bumpToolVersion()
        persist()
    }

    // MARK: - Double tap

    private func doubleTapToEraser() {
        if activeTool == .eraser {
            // 回到 previousWritingTool（恢复 tool type + color + width）
            activeTool = previousWritingTool
        } else {
            if activeTool.isWritingTool {
                previousWritingTool = activeTool
            }
            activeTool = .eraser
        }
        bumpToolVersion()
        persist()
    }

    private func doubleTapToPrevious() {
        activeTool = previousAnyTool
        bumpToolVersion()
        persist()
    }

    // MARK: - 样式更新

    func updateStyle(for kind: InkToolKind, color: Color, width: Double) {
        let c = color.resolveComponents()
        let style = InkToolStyle(red: c.red, green: c.green, blue: c.blue, width: width)
        switch kind {
        case .pen: penStyle = style
        case .pencil: pencilStyle = style
        case .highlighter: highlighterStyle = style
        default: break
        }
        bumpToolVersion()
        persist()
    }

    private func bumpToolVersion() {
        toolVersion += 1
    }

    // MARK: - 持久化

    private struct Persisted: Codable {
        var lastWritingTool: String
        var paletteSide: String
        var paletteVerticalPosition: Double
        var pen: InkToolStyle
        var pencil: InkToolStyle
        var highlighter: InkToolStyle
    }

    private func persist() {
        let p = Persisted(
            lastWritingTool: previousWritingTool.rawValue,
            paletteSide: paletteSide.rawValue,
            paletteVerticalPosition: paletteVerticalPosition,
            pen: penStyle,
            pencil: pencilStyle,
            highlighter: highlighterStyle
        )
        if let data = try? JSONEncoder().encode(p) {
            defaults.set(data, forKey: "inkToolController.v1")
        }
    }

    private func restoreFromDefaults() {
        guard let data = defaults.data(forKey: "inkToolController.v1"),
              let p = try? JSONDecoder().decode(Persisted.self, from: data) else { return }
        penStyle = p.pen
        pencilStyle = p.pencil
        highlighterStyle = p.highlighter
        paletteSide = PaletteSide(rawValue: p.paletteSide) ?? .trailing
        paletteVerticalPosition = p.paletteVerticalPosition
        if let t = InkToolKind(rawValue: p.lastWritingTool), t.isWritingTool {
            previousWritingTool = t
        }
    }
}

// MARK: - Color 组件解析

extension Color {
    func resolveComponents() -> (red: Double, green: Double, blue: Double) {
        let uiColor = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        uiColor.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b))
    }
}
