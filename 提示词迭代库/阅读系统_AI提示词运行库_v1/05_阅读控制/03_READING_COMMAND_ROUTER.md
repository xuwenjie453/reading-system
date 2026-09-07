# Reading Command Router

> Prompt ID：`reading.command_router`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

将已经解析的 Intent 映射到 Reading Core Command，而不是自己改状态。

核心映射：
- NEXT → `end_and_next`（或等价原子 command）；
- END → `end_current_graph`；
- SKIP → `skip_current_graph`；
- RETURN_TOPOLOGY → explicit navigation to topology；
- OPEN_* → resolve permanent ID → explicit navigation/activate；
- START_FROM → update reading context continuation anchor via Core；
- CONTINUE → continue_document/reading context；
- TEMPORAL_ONE → scheduler manual temporal request；
- TEMPORAL_OFF/ON → session policy。

只有 Command COMMITTED/VIEW_COMMITTED 后向用户说成功。
