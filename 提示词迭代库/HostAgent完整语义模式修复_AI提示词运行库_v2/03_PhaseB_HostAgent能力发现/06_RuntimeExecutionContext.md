# RuntimeExecutionContext

> 状态：**ACTIVE**  
> 运行库版本：**v2.0**  
> 生成日期：**2026-09-07**

每次 Prompt invocation 包含：
semantic_mode, executor_type, agent_session_id, host_capabilities,
prompt_profile, execution_policy, external_provider_status。

若当前 Agent 是授权 Tier A Host，则它本身就是 HOST_AGENT Executor。
