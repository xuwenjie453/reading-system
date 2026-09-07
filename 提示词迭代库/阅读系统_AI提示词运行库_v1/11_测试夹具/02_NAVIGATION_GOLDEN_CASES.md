# Golden Cases：Navigation

> Prompt ID：`fixture.navigation`  
> 版本：`runtime-v1.0`  
> 模式：**TEST**  
> 日期：**2026-09-07**

- “下一块” → NEXT / explicit continuation；Temporal cannot insert。
- “结束” → END / Scheduler free。
- “结束，下一块” → END_AND_NEXT。
- “回去” → BACK navigation history（若 history 有明确 target）。
- “上一块” → PREVIOUS ordinal。
- “回到图谱” → RETURN_TOPOLOGY。
- “从这里继续” → START_FROM current graph。
- “今天只读这本书” → session temporal off。
- “给我一个以前感兴趣的内容” → TEMPORAL_ONE。
