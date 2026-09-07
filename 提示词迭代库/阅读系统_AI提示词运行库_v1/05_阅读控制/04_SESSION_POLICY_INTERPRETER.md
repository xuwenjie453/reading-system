# Session Policy Interpreter

> Prompt ID：`reading.session_policy`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

把用户对“本次阅读”的自然语言约束转为会话 policy，而不是永久心理状态。

例：
- “今天只读这本书” → `temporal_enabled=false` for current session/document plan。
- “今天可以多穿插旧内容” → session temporal boost，但仍受 minimum interval/cooldown。
- “从这里继续” → continuation anchor 改到 current graph 后续。

输出结构化 policy changes，并标记 `scope=SESSION|DOCUMENT|GRAPH_EXPLICIT_POLICY`。
