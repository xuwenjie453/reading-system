# InkToolController 实现 Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

建立唯一工具状态控制器。

建议状态：

```text
InkToolState
├── activeTool
├── previousAnyTool
├── previousWritingTool
├── penStyle(color,width)
├── pencilStyle(color,width)
├── highlighterStyle(color,width)
├── eraserStyle
├── paletteExpanded
├── paletteSide
└── paletteVerticalPosition
```

所有工具变化统一：

```text
Toolbar tap
Double tap
Future squeeze
→ InkToolAction
→ InkToolController
→ new state
→ build PKTool
→ canvas.tool = PKTool
→ UI refresh
```

禁止任何 View 直接长期维护自己的 selectedTool 真源。
