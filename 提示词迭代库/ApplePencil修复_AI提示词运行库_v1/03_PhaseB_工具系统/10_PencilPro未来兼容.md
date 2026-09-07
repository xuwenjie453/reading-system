# Apple Pencil Pro / Squeeze 未来兼容 Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

本次不要求完成 Pencil Pro squeeze。

但架构不得阻塞未来：

```text
squeeze
→ show contextual palette
```

当前只保留：
- PencilInteractionController 统一处理系统 Pencil action；
- InkToolAction 可扩展。

不要为了 future squeeze 改动 Canvas geometry。
