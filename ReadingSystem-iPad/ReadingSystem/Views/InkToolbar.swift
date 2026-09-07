// InkToolbar.swift — Phase B: 圆形 Current Tool Button + 纵向 Ink Palette + 属性面板
// screen overlay，不参与 CanonicalDocument layout；不因按钮存在减少正文宽度
// 左/右侧自动镜像；tap outside 收起；收起不等于 drawing disabled

import SwiftUI
import PencilKit

struct InkToolbar: View {
    @ObservedObject var controller: InkToolController

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            // tap outside 收起 palette
            if controller.paletteExpanded {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { controller.handle(.closePalette, strokeActive: false) }
            }

            VStack(spacing: 10) {
                if controller.paletteExpanded {
                    palette
                        .transition(.scale(scale: 0.8, anchor: .bottomTrailing).combined(with: .opacity))
                }
                currentToolButton
            }
            .padding(.trailing, 12)
            .padding(.bottom, 12)
        }
        .animation(.spring(response: 0.25, dampingFraction: 0.8), value: controller.paletteExpanded)
    }

    // MARK: - 圆形按钮

    private var currentToolButton: some View {
        Button {
            controller.handle(.togglePalette, strokeActive: false)
        } label: {
            ZStack {
                Circle()
                    .fill(.regularMaterial)
                    .frame(width: 48, height: 48)
                    .overlay(Circle().strokeBorder(Color.primary.opacity(0.1), lineWidth: 0.5))
                Image(systemName: controller.activeTool.systemImage)
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(.primary)
                if let style = controller.currentStyle {
                    Circle()
                        .fill(style.colorSwiftUI)
                        .frame(width: 12, height: 12)
                        .overlay(Circle().strokeBorder(Color.primary.opacity(0.15), lineWidth: 0.5))
                        .offset(x: 14, y: 14)
                }
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - 纵向 palette

    private var palette: some View {
        VStack(spacing: 8) {
            ForEach(InkToolKind.allCases) { kind in
                paletteButton(kind)
            }
        }
        .padding(8)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5))
        .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
    }

    private func paletteButton(_ kind: InkToolKind) -> some View {
        Button {
            controller.handle(.select(kind), strokeActive: false)
        } label: {
            ZStack {
                Circle()
                    .fill(kind == controller.activeTool ? Color.accentColor.opacity(0.15) : Color.clear)
                    .frame(width: 40, height: 40)
                Image(systemName: kind.systemImage)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(kind == controller.activeTool ? Color.accentColor : Color.primary)
                if kind.isWritingTool, let style = styleFor(kind) {
                    Circle()
                        .fill(style.colorSwiftUI)
                        .frame(width: 10, height: 10)
                        .offset(x: 12, y: 12)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func styleFor(_ kind: InkToolKind) -> InkToolStyle? {
        switch kind {
        case .pen: return controller.penStyle
        case .pencil: return controller.pencilStyle
        case .highlighter: return controller.highlighterStyle
        default: return nil
        }
    }
}

// MARK: - 属性面板（颜色 + 粗细）

struct InkAttributesPanel: View {
    @ObservedObject var controller: InkToolController

    private let paletteColors: [Color] = [
        .black, .gray, .red, .orange, .yellow, .green, .blue, .purple,
    ]

    private let widths: [Double] = [1.5, 2.5, 4.0, 6.0, 12.0]

    var body: some View {
        let kind = controller.activeTool
        if kind.isWritingTool, let style = controller.currentStyle {
            VStack(alignment: .leading, spacing: 12) {
                Text(kind.displayName)
                    .font(.footnote.weight(.medium))

                HStack(spacing: 8) {
                    ForEach(paletteColors, id: \.self) { color in
                        Button {
                            controller.updateStyle(for: kind, color: color, width: style.width)
                        } label: {
                            Circle()
                                .fill(color)
                                .frame(width: 26, height: 26)
                                .overlay(Circle().strokeBorder(Color.primary.opacity(0.15), lineWidth: 0.5))
                                .overlay(Circle().strokeBorder(Color.accentColor, lineWidth: isSameColor(color, style) ? 2 : 0))
                        }
                        .buttonStyle(.plain)
                    }
                }

                HStack(spacing: 10) {
                    ForEach(widths, id: \.self) { w in
                        Button {
                            controller.updateStyle(for: kind, color: style.colorSwiftUI, width: w)
                        } label: {
                            Circle()
                                .fill(style.colorSwiftUI)
                                .frame(width: sizeForWidth(w), height: sizeForWidth(w))
                                .overlay(Circle().strokeBorder(Color.accentColor, lineWidth: abs(w - style.width) < 0.01 ? 2 : 0))
                        }
                        .buttonStyle(.plain)
                        .frame(maxWidth: .infinity)
                    }
                }
            }
            .padding(12)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5))
        }
    }

    private func sizeForWidth(_ w: Double) -> CGFloat {
        CGFloat(6 + w * 3)
    }

    private func isSameColor(_ a: Color, _ b: InkToolStyle) -> Bool {
        let ca = a.resolveComponents()
        return abs(ca.red - b.red) < 0.05 && abs(ca.green - b.green) < 0.05 && abs(ca.blue - b.blue) < 0.05
    }
}
