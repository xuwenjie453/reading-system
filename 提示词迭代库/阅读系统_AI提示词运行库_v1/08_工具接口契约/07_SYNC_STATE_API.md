# Sync / Device State API 契约

> Prompt ID：`tools.sync_api`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

AI 主要 Query：device status、session status、sync health、pending conflict summary。

底层 server_seq/client_seq、GraphPatch apply、ACK、Annotation binary 不应由语言模型逐消息编排；Reading Bridge/Sync Engine 确定性执行。

AI 只有在用户问状态/冲突时读取结果并解释，或触发受控 reconnect/pairing action。
