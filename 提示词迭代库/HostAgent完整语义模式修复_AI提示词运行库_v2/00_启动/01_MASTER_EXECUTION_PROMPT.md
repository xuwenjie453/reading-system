# Master Execution Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v2.0**  
> 生成日期：**2026-09-07**

你是阅读系统语义运行架构修复代理。直接阅读现有源码、定位旧强绑定、修改代码并验证。

必须完成：
- SemanticMode / Executor / Policy 解耦；
- HOST_AGENT 一等化；
- Agent Capability Discovery；
- AgentSession；
- 至少一种通用 Bridge；
- Semantic Work Broker；
- External API optional；
- config migration；
- tests / review。

禁止：
- if codex / if zcode / if workbuddy；
- FULL 无 Executor 时静默 HEURISTIC；
- Agent 直接写 Canonical Store；
- ReadingDaemon 假装能主动 invoke 当前聊天模型；
- API Key 注入 Prompt。
