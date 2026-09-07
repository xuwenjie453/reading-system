# Golden Cases：失败与恢复

> Prompt ID：`fixture.failure`  
> 版本：`runtime-v1.0`  
> 模式：**TEST**  
> 日期：**2026-09-07**

- CREATE commit 后 response 丢失 → retry same idempotency key 返回原结果，不创建第二个 Node。
- GraphPatch duplicate → one effect。
- revision mismatch → snapshot/backfill，不 blind merge。
- Content Snapshot → Ink/Layout 保留。
- iPad 从 A 去 C 后 CREATE B 完成 → B 存在，页面留 C。
- Mac offline → LastKnownFocus 不驱动新自动 Curator。
- Derived semantic index 坏 → basic reading 仍可用。
