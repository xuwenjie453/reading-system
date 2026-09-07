# Config Migration

> 状态：**ACTIVE**  
> 运行库版本：**v2.0**  
> 生成日期：**2026-09-07**

full + no key → FULL + HOST_ONLY，合法。
full + key但从未明确启用 external → HOST_ONLY + configured inactive。
明确启用 external background → 可迁 AUTO。
heuristic → 保持。
