# Annotation Sync 兼容 Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

工具系统 UI 不应改变 Annotation wire format。

Annotation Snapshot 仍然只需要：
- entity binding；
- revision；
- layout binding；
- drawing bytes/hash；
- writer metadata。

当前 tool、palette position、color picker state：
> local preference，不同步。

如果新增 layoutProfileID/layoutEpoch 字段，只做向后兼容 schema extension。
