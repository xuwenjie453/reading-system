# Reading / Session API 契约

> Prompt ID：`tools.session_api`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

逻辑 Commands：
- `activate_graph(graph_id,push_mode,reason)`；
- `end_current_graph()`；
- `skip_current_graph()`；
- `end_and_next()`；
- `continue_document()`；
- `start_from_graph()`；
- `request_navigation(target,mode,preconditions)`；
- `set_session_policy(...)`。

禁止 `set_focus`。

导航成功判定以 iPad View commit 为准，不以“命令已发送”为准。
