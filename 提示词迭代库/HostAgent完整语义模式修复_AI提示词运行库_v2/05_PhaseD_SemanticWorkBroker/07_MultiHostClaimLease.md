# Multi Host Claim / Lease

> 状态：**ACTIVE**  
> 运行库版本：**v2.0**  
> 生成日期：**2026-09-07**

PENDING → CLAIMED(agentA, lease_until)。
Agent失联，lease过期后回 PENDING。
必须有 work_id / attempt_id / result_id / idempotency。
