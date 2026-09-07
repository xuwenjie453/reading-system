# Interest / Temporal API 契约

> Prompt ID：`tools.temporal_api`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

逻辑 Query：get_interest_state、get_temporal_state、get_active_due_candidates、get_long_term_due_candidates。

逻辑 Command：commit_reading_episode、set_temporal_policy、显式 rebuild（管理操作）。

**不存在** `set_current_interest(87)` 供普通 AI 调用。数值更新由 deterministic engine。
