# Stable Runtime Profile v1

> Prompt ID：`profile.runtime`  
> 版本：`runtime-v1.0`  
> 模式：**PROFILE**  
> 日期：**2026-09-07**

这是日常阅读系统的默认 Profile。不要自动选择目录里“最新”的 module。

```text
profile_id: stable-runtime-v1
master: runtime.master
responder: module.responder
graph_curator: module.graph_curator
segment_writer: module.segment_writer
node_title: module.node_title
node_summary: module.node_summary
block_title: module.block_title
block_summary: module.block_summary
parser_genre: parser.genre
parser_structure: parser.structure
parser_boundary: parser.boundary
parser_block_reviewer: parser.block_reviewer
parser_semantic_validator: parser.semantic_validator
navigation_intent: reading.nav_intent
target_resolver: reading.target_resolver
interest_semantic_features: interest.semantic_features
context_policy: context.*
policy_set: policy.*
```

Profile activation 时应编译为 immutable snapshot。每个 QA Turn/ParseJob 在开始时冻结 snapshot id。
