# START HERE：阅读系统完整设计基线

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 1. 本包是什么
本目录是阅读系统的**唯一完整设计基线**。它不是聊天摘要，也不是历史讨论拼贴。一个没有参与过原始讨论的 AI 或工程师，应当只依赖本包即可理解产品目标、对象模型、行为不变量、MacBook 运行体系、iPad 客户端、同步协议、时序系统和 v1 验收标准。

系统最终对应两份主要成果：

1. **MacBook 端：提示词运行库 / 阅读系统运行包**：由 zcode/Codex 驱动，包含 Prompt Modules、Profiles、Context Builder、Reading Core/ReadingDaemon、解析、图谱、兴趣时序、调度、同步和恢复规则。
2. **iPad 端：阅读器客户端代码**：可在 Xcode 编译并安装到真实 iPad，支持 ContentGraph、Block/Node Reader、Apple Pencil、离线缓存、重连和同步。

## 2. 必须按顺序阅读
1. `00_起始与规范/`
2. `01_共享认知与内容模型/`
3. `02_MacBook端系统/`
4. `03_iPad客户端/`
5. `04_通信与同步/`
6. `05_实现与验收/`
7. `99_变更与废弃规则/`

不要先看单个实现文档就自行推断全局行为。

## 3. 规范词
- **必须 / MUST**：违反即破坏系统设计。
- **应该 / SHOULD**：默认实现，若改变必须确认不破坏不变量。
- **可以 / MAY**：实现自由度。
- **v1 禁止**：第一版不得自动实现。

## 4. 核心产品模型
```text
MacBook：语言、推理、解析、调度、长期状态权威
                     ↕
             Reading Bridge
                     ↕
iPad：阅读、空间拓扑、真实页面、Apple Pencil
```

长期组织单位不是聊天，而是：
```text
Document
  → ContentBlock
      → ContentGraph
          → ContentNode
```

图负责表达“思考方向发生什么分叉”，节点正文负责表达“一个方向内部如何逐渐深入”。

## 5. 五条最高级原则
1. 原文不可变。
2. Focus 不由 AI 自由设置，而由 iPad 当前语义 ViewState 派生。
3. Node 正文 append-only；旧错误通过后续追加纠正，不静默重写。
4. Mac 是长期 Canonical Authority；iPad 本地优先交互并可靠缓存。
5. AI 负责语义判断，确定性代码负责状态、事务、Revision、权限和安全。
