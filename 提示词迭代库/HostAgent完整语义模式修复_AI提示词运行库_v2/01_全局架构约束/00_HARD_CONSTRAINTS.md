# 全局硬约束

> 状态：**ACTIVE**  
> 运行库版本：**v2.0**  
> 生成日期：**2026-09-07**

1. FULL 的前置是合格 Semantic Executor，不是 API Key。
2. HOST_AGENT 是一等 Executor。
3. External API 只是可选 Executor。
4. HEURISTIC 是独立模式，不是 FULL 的静默 fallback。
5. Agent 不能直接修改 Canonical Store。
6. Host compatibility 基于 capability，不基于品牌。
7. Agent Session 是短期状态。
8. ReadingDaemon 不依赖 Host 永久在线。
9. iPad protocol 本次不改变。
10. Prompt Profile 属于阅读系统，而不是具体 Agent。
11. External secrets 不进入 Prompt。
12. 多 Host 必须 claim/lease/idempotency。
