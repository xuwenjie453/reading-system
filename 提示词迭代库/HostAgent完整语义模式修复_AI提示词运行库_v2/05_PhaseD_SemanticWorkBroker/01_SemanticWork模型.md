# SemanticWork 模型

> 状态：**ACTIVE**  
> 运行库版本：**v2.0**  
> 生成日期：**2026-09-07**

字段：
work_id, work_type, priority, created_at, context_snapshot_ref,
prompt_role, prompt_profile_id, output_schema, status,
claimed_by, lease_until, attempt, retention_policy, origin_agent_session。

状态：
PENDING / CLAIMED / COMPLETED / FAILED_RETRYABLE / FAILED_FINAL / EXPIRED。
