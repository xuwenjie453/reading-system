# SemanticMode / Executor / Policy 分离

> 状态：**ACTIVE**  
> 运行库版本：**v2.0**  
> 生成日期：**2026-09-07**

```text
SemanticMode = HEURISTIC | FULL

SemanticExecutorType = HOST_AGENT | EXTERNAL_API | future...

SemanticExecutionPolicy =
HOST_ONLY | HOST_PREFERRED | AUTO | EXTERNAL_ONLY
```

任何 `fullSemantic -> requireApiKey()` 等价逻辑都必须删除。
