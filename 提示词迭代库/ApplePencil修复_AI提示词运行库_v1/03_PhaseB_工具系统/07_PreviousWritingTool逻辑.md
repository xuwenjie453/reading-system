# PreviousWritingTool 状态机 Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

区分：

```text
previousAnyTool
previousWritingTool
```

原因：
```text
Pen
→ Lasso
→ Eraser
```

从 Eraser 恢复时应回 Pen，而不是 Lasso。

Writing tools：
- Pen
- Pencil
- Highlighter

Selection tool：
- Lasso

Eraser：
- Eraser

每次进入 Writing Tool 时更新 previousWritingTool。
进入 Eraser 时不覆盖 previousWritingTool。
