# Provenance & Audit Policy

> Prompt ID：`policy.provenance`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

所有 AI 生成的长期对象或结构化决策应带可恢复 provenance：
- qa_turn_id / parse_job_id；
- graph/focus/source object IDs；
- prompt snapshot/profile；
- module id/version/hash；
- context builder version；
- model/runtime id；
- timestamp；
- output object IDs。

Audit 保存结构化 decision/evidence，不要求也不保存模型私有 chain-of-thought。

用户问“为什么刚才 CREATE？”时，应根据这些结构化字段和 Cognitive Delta 给出简明解释，不伪造隐藏思维过程。
