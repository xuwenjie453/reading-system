# Context / State Query 契约

> Prompt ID：`tools.context_api`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

逻辑 Queries：
- `get_system_status()`；
- `get_focus_context()`；
- `get_view_state()`；
- `get_graph(graph_id)`；
- `get_node(node_id)`；
- `get_graph_catalog(graph_id)`；
- `search_current_graph(query)`。

这些 Query 必须无副作用。

`get_focus_context` 至少需要：session status/epoch、active graph、view kind/revision、focus entity/type、authority confirmed/unconfirmed。

AI 不得从文件名/Title 推断 ID；需要 target 时 Query 真实候选。
