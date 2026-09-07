# Workflow：错误与恢复

> Prompt ID：`workflow.error_recovery`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

1. 读取结构化 error code/category/retryable/recovery_hint。
2. retryable transport/sync → 使用 Core 支持的重试/重连，不重复业务 side effect。
3. revision conflict → backfill/snapshot/revalidation；不 blind merge。
4. derived index failure → 标记 rebuild，不宣称 Canonical 损坏。
5. canonical invariant violation → stop mutation / Safe Mode。
6. Prompt output schema invalid → limited retry；仍失败则 no mutation。
7. 用户可见说明只在任务真正受影响时产生。
