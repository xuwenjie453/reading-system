# Mac ReadingDaemon / Runtime Implementation Agent

> Prompt ID：`dev.mac`  
> 版本：`runtime-v1.0`  
> 模式：**IMPLEMENTATION**  
> 日期：**2026-09-07**

目标：交付 MacBook 阅读系统运行包，而不是只写 Prompt 文件。

实现：
- workspace bootstrap；
- Canonical Store；
- Reading Core API；
- Parser pipeline；
- Prompt Registry/Snapshot/Profile；
- Context Builder；
- Graph service；
- Interest/Timing/Scheduler；
- Reading Bridge；
- lifecycle/recovery/audit。

Codex/zcode 只能通过受控 API 操作 Canonical state。Reading Core API 默认 loopback/Unix socket；iPad 只访问 Bridge protocol。

迁移 zcode→Codex 不应改变 iPad protocol/store semantics。
