# START HERE：通用 Host Agent 完整语义模式修复

> 状态：**ACTIVE**  
> 运行库版本：**v2.0**  
> 生成日期：**2026-09-07**

当前阅读系统错误地把 FULL Semantic Mode 与 External API Key 绑定。

本次修复必须建立：

```text
FULL Semantic Mode
→ requires eligible Semantic Executor

Semantic Executor
├── HOST_AGENT
└── EXTERNAL_API
```

Codex、ZCode、WorkBuddy 或其他 Agent 只是 Host Agent 的不同宿主，不得写死品牌。

执行顺序：
1. 01_全局架构约束
2. 02_PhaseA_语义模式解耦
3. 03_PhaseB_HostAgent能力发现
4. 04_PhaseC_AgentBridge与Adapter
5. 05_PhaseD_SemanticWorkBroker
6. 06_PhaseE_ExternalProvider与配置迁移
7. 07_测试与验收
8. 08_代码审查

只隐藏 API Key UI 不算修复。
