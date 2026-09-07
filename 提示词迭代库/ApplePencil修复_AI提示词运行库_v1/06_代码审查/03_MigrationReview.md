# Annotation Migration Review Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

Migration 必须：
- backup；
- immutable source hash；
- explicit from/to epoch；
- deterministic；
- idempotent；
- crash-safe；
- no reflow guess；
- 可回滚。

如果只是为了“看起来差不多”对所有 drawing 乘 scale：
> 拒绝。
