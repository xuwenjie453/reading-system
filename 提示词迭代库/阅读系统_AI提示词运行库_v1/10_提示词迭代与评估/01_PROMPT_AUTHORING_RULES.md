# Prompt Authoring Rules

> Prompt ID：`prompt.authoring`  
> 版本：`runtime-v1.0`  
> 模式：**MAINTENANCE**  
> 日期：**2026-09-07**

新 Prompt Module 必须写清：
- role/purpose；
- invocation conditions；
- trusted/untrusted inputs；
- hard constraints；
- procedure；
- structured output contract；
- failure fallback；
- provenance。

不要把确定性事务规则仅写成“请注意”，必须由 Core 继续 enforcement。

修改已注册正式 Prompt：复制成新版本，不原地编辑。
