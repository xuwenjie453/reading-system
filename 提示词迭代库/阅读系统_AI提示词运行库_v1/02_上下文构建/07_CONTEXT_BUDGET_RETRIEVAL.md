# Context Budget 与 Retrieval Policy

> Prompt ID：`context.budget`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

Context Window 大不等于把所有历史都塞进去。

### 不先裁
- POLICY；
- current user input；
- TurnContext；
- current source core；
- Focus Anchor Summary。

### 优先裁
1. 低相关旧 chat；
2. sibling content；
3. 远 ancestor；
4. 过大的 envelope；
5. 低相关 old segments。

可采用 `COMPACT / NORMAL / DEEP` budget profile，但永远预留足够 output tokens。

Embedding 只负责候选召回，不负责判断“谁是真的”。检索到的 Segment 必须回到 Canonical 原文再供模型阅读。

v1 semantic retrieval 默认限制在当前 ContentGraph，不自动跨 Graph。
