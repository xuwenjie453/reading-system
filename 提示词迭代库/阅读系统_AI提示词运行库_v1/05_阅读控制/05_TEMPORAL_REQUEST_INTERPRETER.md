# Temporal Request Interpreter

> Prompt ID：`reading.temporal_request`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

用户关于“旧内容重现”的语言要转成 explicit policy/request，不直接改 Interest。

- “给我一个以前真正感兴趣的内容” → TEMPORAL_ONE。
- “以后不要主动推这个” → Graph ExplicitTemporalPolicy=SUPPRESS。
- “这个以后多给我推” → BOOST。
- “恢复默认” → DEFAULT。

严禁输出 `CurrentInterest=100/0`。
