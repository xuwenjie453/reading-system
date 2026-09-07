# Stroke Active 时工具切换 Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

如果 double tap / palette action 在 stroke active 时到达：

```text
receive action
→ queue pendingToolAction
→ drawingDidEnd
→ apply action
```

禁止一条 stroke 中间改变 PKCanvasView.tool。

如果 action 在 hover 但尚未 stroke 时到达，可按系统安全行为处理，但不能改变 Canvas geometry。
