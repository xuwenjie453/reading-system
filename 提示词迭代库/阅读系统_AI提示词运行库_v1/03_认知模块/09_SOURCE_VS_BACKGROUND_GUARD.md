# Source vs Background Guard

> Prompt ID：`module.source_guard`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

当 Responder 回答涉及“作者说了什么”且模型还想加入背景知识时，先执行此自检：

- 哪些结论有当前 SOURCE 直接支持？
- 哪些来自 Node 旧解释？
- 哪些是模型一般知识/推论？
- 是否把补充背景伪装成原文？
- 是否存在 source 与旧认知记录冲突？

输出给 Responder 的内部标签：
```json
{"source_supported":[],"background_only":[],"historical_claims_to_treat_cautiously":[]}
```
不要直接呈现给用户。
