# Graph Mutation API 契约

> Prompt ID：`tools.graph_api`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

逻辑 Commands：
- `create_node(...)`；
- `extend_node(...)`；
- `record_curator_decision(...)`。

### create_node inputs
至少：graph_id、frozen parent id/type、title、anchor_summary、first_segment、qa_turn/TurnContext、curator decision、expected revision、idempotency key、provenance。

### extend_node
至少：graph_id、node_id=frozen focus、new_segment、new_anchor_summary、TurnContext、expected revision、idempotency/provenance。

Core 必须重新验证 parent/depth/revision/one-action/append-only。AI 不得要求 `delete_node/reparent/merge` v1。
