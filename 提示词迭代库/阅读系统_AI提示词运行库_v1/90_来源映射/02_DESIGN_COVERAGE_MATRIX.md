# DESIGN COVERAGE MATRIX

> Prompt Library: `runtime-v1.0`

下面列出 Canonical 设计稿以及主要承接 Prompt 区域。

- `00_起始与规范/00_START_HERE.md` → 00_启动 + 01_全局政策 + 09_Profiles
- `00_起始与规范/01_系统设计总览.md` → 00_启动 + 01_全局政策 + 09_Profiles
- `00_起始与规范/02_术语与对象模型.md` → 00_启动 + 01_全局政策 + 09_Profiles
- `00_起始与规范/03_全局不变量.md` → 00_启动 + 01_全局政策 + 09_Profiles
- `00_起始与规范/04_v1范围与非目标.md` → 00_启动 + 01_全局政策 + 09_Profiles
- `00_起始与规范/05_冲突裁决与设计优先级.md` → 00_启动 + 01_全局政策 + 09_Profiles
- `00_起始与规范/06_两份最终成果.md` → 00_启动 + 01_全局政策 + 09_Profiles
- `01_共享认知与内容模型/01_资料解析与ContentBlock.md` → 02_上下文构建 + 03_认知模块 + 07_系统工作流
- `01_共享认知与内容模型/02_ContentGraph与ContentNode.md` → 02_上下文构建 + 03_认知模块 + 07_系统工作流
- `01_共享认知与内容模型/03_Title与AnchorSummary.md` → 02_上下文构建 + 03_认知模块 + 07_系统工作流
- `01_共享认知与内容模型/04_EXTEND_CREATE机制.md` → 02_上下文构建 + 03_认知模块 + 07_系统工作流
- `01_共享认知与内容模型/05_Focus_ViewState_TurnContext.md` → 02_上下文构建 + 03_认知模块 + 07_系统工作流
- `01_共享认知与内容模型/06_ContextBuilder.md` → 02_上下文构建 + 03_认知模块 + 07_系统工作流
- `02_MacBook端系统/01_Mac总体架构.md` → 04/05/06/07/08/10/12 对应 Runtime 与 Implementation Prompts
- `02_MacBook端系统/02_CanonicalStore.md` → 04/05/06/07/08/10/12 对应 Runtime 与 Implementation Prompts
- `02_MacBook端系统/03_ReadingCore与API.md` → 04/05/06/07/08/10/12 对应 Runtime 与 Implementation Prompts
- `02_MacBook端系统/04_Prompt运行库与迭代体系.md` → 04/05/06/07/08/10/12 对应 Runtime 与 Implementation Prompts
- `02_MacBook端系统/05_InterestEngine_v2.md` → 04/05/06/07/08/10/12 对应 Runtime 与 Implementation Prompts
- `02_MacBook端系统/06_TemporalTimingEngine_v2.md` → 04/05/06/07/08/10/12 对应 Runtime 与 Implementation Prompts
- `02_MacBook端系统/07_ReadingScheduler.md` → 04/05/06/07/08/10/12 对应 Runtime 与 Implementation Prompts
- `02_MacBook端系统/08_生命周期启动恢复.md` → 04/05/06/07/08/10/12 对应 Runtime 与 Implementation Prompts
- `02_MacBook端系统/09_Mac对话与命令体验.md` → 04/05/06/07/08/10/12 对应 Runtime 与 Implementation Prompts
- `02_MacBook端系统/10_解析流水线详细规范.md` → 04/05/06/07/08/10/12 对应 Runtime 与 Implementation Prompts
- `02_MacBook端系统/11_审计版本迁移与恢复.md` → 04/05/06/07/08/10/12 对应 Runtime 与 Implementation Prompts
- `02_MacBook端系统/12_Mac运行包目标结构.md` → 04/05/06/07/08/10/12 对应 Runtime 与 Implementation Prompts
- `03_iPad客户端/01_iPad产品总览.md` → 12_开发与交付代理/01,06–09 + 11_测试夹具
- `03_iPad客户端/02_正文Reader体验.md` → 12_开发与交付代理/01,06–09 + 11_测试夹具
- `03_iPad客户端/03_Topology.md` → 12_开发与交付代理/01,06–09 + 11_测试夹具
- `03_iPad客户端/04_ApplePencil与Annotation.md` → 12_开发与交付代理/01,06–09 + 11_测试夹具
- `03_iPad客户端/05_CanonicalLayout.md` → 12_开发与交付代理/01,06–09 + 11_测试夹具
- `03_iPad客户端/06_客户端工程架构.md` → 12_开发与交付代理/01,06–09 + 11_测试夹具
- `03_iPad客户端/07_本地缓存与持久化.md` → 12_开发与交付代理/01,06–09 + 11_测试夹具
- `03_iPad客户端/08_客户端生命周期与离线.md` → 12_开发与交付代理/01,06–09 + 11_测试夹具
- `03_iPad客户端/09_iPad_v1验收范围.md` → 12_开发与交付代理/01,06–09 + 11_测试夹具
- `03_iPad客户端/10_iPad交付边界.md` → 12_开发与交付代理/01,06–09 + 11_测试夹具
- `04_通信与同步/01_Mac_iPad连接架构.md` → 08_工具接口契约 + 07_系统工作流/重连 + 12/03,09,15
- `04_通信与同步/02_协议与消息模型.md` → 08_工具接口契约 + 07_系统工作流/重连 + 12/03,09,15
- `04_通信与同步/03_Content_Snapshot_Patch_ACK.md` → 08_工具接口契约 + 07_系统工作流/重连 + 12/03,09,15
- `04_通信与同步/04_会话与导航协议.md` → 08_工具接口契约 + 07_系统工作流/重连 + 12/03,09,15
- `04_通信与同步/05_Annotation_Layout同步.md` → 08_工具接口契约 + 07_系统工作流/重连 + 12/03,09,15
- `04_通信与同步/06_配对认证与安全边界.md` → 08_工具接口契约 + 07_系统工作流/重连 + 12/03,09,15
- `04_通信与同步/07_幂等冲突错误处理.md` → 08_工具接口契约 + 07_系统工作流/重连 + 12/03,09,15
- `05_实现与验收/01_端到端主流程.md` → 11_测试夹具 + 12_开发与交付代理
- `05_实现与验收/02_失败场景矩阵.md` → 11_测试夹具 + 12_开发与交付代理
- `05_实现与验收/03_测试策略.md` → 11_测试夹具 + 12_开发与交付代理
- `05_实现与验收/04_系统v1验收清单.md` → 11_测试夹具 + 12_开发与交付代理
- `05_实现与验收/05_实施顺序与里程碑.md` → 11_测试夹具 + 12_开发与交付代理
- `05_实现与验收/06_AI接手开发指令.md` → 11_测试夹具 + 12_开发与交付代理
- `99_变更与废弃规则/00_最新设计优先级.md` → 90_来源映射/01_DEPRECATED_RULES_GUARD.md
- `99_变更与废弃规则/01_已被覆盖的旧决策.md` → 90_来源映射/01_DEPRECATED_RULES_GUARD.md
- `CONSISTENCY_CHECK.md` → README / Manifest / Consistency
- `DESIGN_MANIFEST.md` → README / Manifest / Consistency
- `FILE_HASHES.md` → README / Manifest / Consistency
- `README.md` → README / Manifest / Consistency
