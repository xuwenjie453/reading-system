# Semantic Result 幂等

> 状态：**ACTIVE**  
> 运行库版本：**v2.0**  
> 生成日期：**2026-09-07**

两个 Agent重复执行同 Work，Canonical side effect 只能一次。
Graph mutation继续依赖 qa_turn_id / idempotency_key / expected_revision。
