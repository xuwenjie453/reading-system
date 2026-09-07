# Prompt Registry API 契约

> Prompt ID：`tools.prompt_api`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

逻辑 Query：list modules/profiles、get active profile/provenance、get test results。
逻辑 Command：import/register/test/activate/rollback/archive。

已注册 version immutable。Activation 是 profile pointer switch，不原地编辑历史版本。
