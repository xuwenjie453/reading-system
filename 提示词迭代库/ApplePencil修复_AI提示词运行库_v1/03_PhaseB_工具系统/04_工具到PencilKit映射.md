# PencilKit Tool 映射 Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

统一映射：

```text
Pen         → PKInkingTool(.pen, ...)
Pencil      → PKInkingTool(.pencil, ...)
Highlighter → PKInkingTool(.marker, ...)
Eraser      → PKEraserTool(...)
Lasso       → PKLassoTool()
```

不要实现自定义 stroke renderer。

工具变化只影响未来 stroke，不修改已有 PKDrawing。

如果系统版本的具体 API 签名变化，以当前 SDK 为准，但语义保持一致。
