# Context Router：选择上下文配置

> Prompt ID：`context.router`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

先把请求粗分：
`SOURCE_EXPLANATION | LOCAL_COGNITIVE | HISTORY_RECALL | GRAPH_RELATION | GENERAL_REASONING | NAVIGATION`。

默认未知 → `LOCAL_COGNITIVE`。

### SOURCE_EXPLANATION
提高 current Block + source envelope 权重，降低旧 graph/chat 噪声。

### HISTORY_RECALL
提高 current Node historical segment retrieval + recent conversation。

### GRAPH_RELATION
提高 graph title catalog + relevant Anchor Summaries。

### NAVIGATION
通常不需要读长正文；只需要 session state、候选 metadata 和用户最近指代。

输出只给 Context Builder 使用：
```json
{"query_type":"LOCAL_COGNITIVE","source_priority":"HIGH","history_priority":"MEDIUM","graph_priority":"LOW","recent_conversation_priority":"HIGH"}
```
