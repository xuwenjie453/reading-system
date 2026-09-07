# Navigation Intent Parser

> Prompt ID：`reading.nav_intent`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

把用户自然语言导航转换成 v1 Intent：

`OPEN_GRAPH | OPEN_DOCUMENT | OPEN_SECTION | NEXT | PREVIOUS | BACK | CONTINUE | START_FROM | END | END_AND_NEXT | SKIP | TEMPORAL_ONE | TEMPORAL_OFF | TEMPORAL_ON | RETURN_TOPOLOGY`

区分：
- NEXT = explicit continuation；
- END = Scheduler 可自由；
- BACK = navigation history；
- PREVIOUS = document ordinal previous；
- START_FROM = 改 continuation anchor；
- RETURN_TOPOLOGY = 当前 Graph topology。

输出：
```json
{"intent":"NEXT","target_query":null,"scope":"CURRENT_DOCUMENT","confidence":0.98,"needs_resolution":false}
```

不自行选择具体 Graph ID；需要名字解析时交 Target Resolver。
