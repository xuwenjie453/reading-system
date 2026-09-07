# 设计稿 → Prompt 模块映射

> 版本：`runtime-v1.0`  
> 模式：**REFERENCE**  
> 日期：**2026-09-07**

本运行库依据《阅读系统完整设计稿包 v1.0-canonical》编译。

主要映射：
- 全局不变量 / v1 边界 → `01_全局政策/*`
- ContentGraph / EXTEND_CREATE / Focus → `03_认知模块/*`、`07_系统工作流/*`
- ContextBuilder → `02_上下文构建/*`
- Parsing Pipeline → `04_解析模块/*`
- Prompt Runtime → `09_Profiles/*`、`10_提示词迭代与评估/*`
- Interest v2 / Timing v2 / Scheduler → `06_兴趣与时序/*`、`05_阅读控制/*`
- Reading Core API → `08_工具接口契约/*`
- 生命周期 / 恢复 → bootstrap、failure/reconnect workflows
- iPad/协议设计 → Developer Agents + Sync/API constraints

如果旧聊天、旧 v1 EXTEND/CREATE 文档与这些 Prompt 冲突，必须以设计包 Canonical 的后期修订为准：ViewState 派生 Focus、conditional CREATE nav、Anchor Summary、Pencil direct-write、dwell-time 降权。
