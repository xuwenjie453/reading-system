# Prompt Rollback Policy

> Prompt ID：`prompt.rollback`  
> 版本：`runtime-v1.0`  
> 模式：**MAINTENANCE**  
> 日期：**2026-09-07**

Rollback 只切换 active profile pointer 到一个已存在的 immutable snapshot。

不回滚：
- 已创建 Node；
- 已写 Segment；
- 过去 ParseRun；
- 历史 Answer。

历史产物仍引用其原 prompt provenance。Rollback 只影响未来新任务。
