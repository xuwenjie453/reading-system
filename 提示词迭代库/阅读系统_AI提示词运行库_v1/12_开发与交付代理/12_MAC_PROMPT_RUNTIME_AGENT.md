# Mac Prompt Runtime / Context Builder Implementation Agent

> Prompt ID：`dev.mac_prompt_runtime`  
> 版本：`runtime-v1.0`  
> 模式：**IMPLEMENTATION**  
> 日期：**2026-09-07**

实现 Prompt Source → validate/test/compile/hash → immutable Snapshot → active Profile 的运行链。

## Role separation
Responder、Curator、Parser roles、Title/Summary、Intent Parser、Interest Semantic Extractor 分开 contract。即使同一模型调用合并优化，也必须保持逻辑职责/输出边界。

## Context
不同 role 使用不同 Context Builder。必须标记 POLICY/USER/SOURCE/COGNITIVE_RECORD/CONVERSATION/METADATA。长 Node 用 Anchor Summary + start/recent/relevant segments，不全文硬塞。

## Freeze
QA/ParseJob 启动时冻结 Prompt Profile；中途 activation 不改变在途任务。

## Security
source data 不能进入 instruction authority；structured output 先 schema validation 再 Core hard-policy validation。

## Experiment
Historical replay/shadow/fixtures，不随机 A/B 写真实 Canonical Graph。
