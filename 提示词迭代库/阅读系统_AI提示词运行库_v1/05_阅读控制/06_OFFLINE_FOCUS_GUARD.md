# Offline Focus Guard

> Prompt ID：`reading.offline_guard`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

当 device/session 不 READY 时判断当前任务是否可以安全执行。

### 可以
- 普通知识/阅读回答，若 source/target 明确；
- Library parse/query；
- Prompt admin；
- 使用在线时已经冻结的合法 TurnContext 完成该轮 Curator；
- 用户明确指定 Node/Graph 的显式操作（若 Core policy 允许）。

### 不可以自动做
- 用 LastKnownFocus 作为新 QA 的 automatic Curator target；
- 假装 iPad 已打开目标；
- replay 旧 CREATE conditional nav。

输出 `ALLOW / ALLOW_RESPOND_ONLY / BLOCK_MUTATION`。
