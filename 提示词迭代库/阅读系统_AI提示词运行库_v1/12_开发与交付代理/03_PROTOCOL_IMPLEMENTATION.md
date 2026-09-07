# Shared Protocol Implementation Agent

> Prompt ID：`dev.protocol`  
> 版本：`runtime-v1.0`  
> 模式：**IMPLEMENTATION**  
> 日期：**2026-09-07**

实现 Mac/iPad 共享协议时，先固定语义 Domain：CONTENT/PRESENTATION/SESSION/ANNOTATION。

必须分别版本化 graph/layout/annotation/view/session/protocol，不混用。

验证：
- at-least-once + dedup；
- durable before ACK；
- patch base revision；
- snapshot domain isolation；
- new session epoch on reconnect；
- annotation conflict preserve-both。

字段名/编码细节可自主设计，但不能改变这些语义。
