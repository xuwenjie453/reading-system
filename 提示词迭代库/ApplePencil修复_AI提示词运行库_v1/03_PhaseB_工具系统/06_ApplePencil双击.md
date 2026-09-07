# Apple Pencil Double Tap Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

使用系统 Apple Pencil interaction API 接收 double tap，不自行通过 touch timestamps 识别。

默认遵循：
```text
preferredTapAction
```

至少支持：
- switchEraser
- switchPrevious
- showColorPalette
- showInkAttributes
- showContextualPalette
- ignore

### switchEraser

```text
Writing Tool
→ double tap
→ Eraser
→ double tap
→ previousWritingTool
```

必须恢复：
- tool type
- color
- width

不要写死回 Pen。
