# 阅读系统 — 总览

把书籍资料变成**可沉淀认知的长期阅读系统**：Mac 是长期内容权威（ReadingDaemon），iPad 是阅读交互终端（Topology 内容图 + 稳定布局 Reader + Apple Pencil 手写），AI 只做语义决策、确定性代码守住一切不变量。

设计来源：`提示词迭代库/阅读系统_AI提示词运行库_v1/`（106 个运行库提示词）+ `提示词迭代库/设计稿/阅读系统完整设计稿包_v1/`（Canonical 产品设计）。

## 两份成果

| 成果 | 位置 | 技术栈 | 状态 |
|---|---|---|---|
| **A. Mac 运行包（ReadingDaemon）** | [ReadingSystem-Mac/](ReadingSystem-Mac/) | Node.js 26（零第三方依赖，`node:sqlite` 内置 SQLite WAL） | ✅ 已实现并通过 23 项自动化测试 + 真实书籍解析验收 |
| **B. iPad 客户端** | [ReadingSystem-iPad/](ReadingSystem-iPad/) | Swift/SwiftUI + PencilKit + SQLite3 + URLSessionWebSocketTask（零第三方依赖） | ✅ 全部源码通过 iOS 26.5 SDK 类型检查；真机 Pencil 验收需 Xcode 安装到 iPad |

## 快速上手（3 分钟跑通）

```bash
# ① Mac 端：初始化 + 解析一本真实书籍
cd ReadingSystem-Mac
node bin/readingsystem.mjs init
node bin/readingsystem.mjs parse all
node bin/readingsystem.mjs documents        # 查看解析结果

# ② 问答（启发式模式；配置 LLM Key 后为完整语义回答）
node bin/readingsystem.mjs ask "这一章的核心论证是什么？"

# ③ 启动守护进程 + 配对 iPad（另一个终端）
node bin/readingsystem.mjs start
node bin/readingsystem.mjs pair "我的iPad"   # 把 6 位码填进 iPad App
```

iPad 端：`open ReadingSystem-iPad/ReadingSystem.xcodeproj`，选真机 `Cmd+R`（详见 [ReadingSystem-iPad/README.md](ReadingSystem-iPad/README.md)）。

## 核心铁律（实现中逐条落实）

```
原文不可变                  → Block content.md immutable；Core 拒绝重写
Focus = derive(iPad View)   → 无公开 set_focus；只有 VIEW_COMMITTED 才更新 Focus
Node Body append-only       → EXTEND 仅追加 Segment 文件；旧 Segment 永不移动
一轮 QA 最多一个结构动作     → Core 级 turn_mutations 表强制（不信任 AI 层）
CREATE 自动导航是 conditional → basis 失配即 stale，绝不抢用户页面
AI 做语义、代码做事务        → Curator 输出经 schema + hard policy 双重验证后才由 Core 执行
Mac CONTENT 权威 / iPad 本地优先 → durable before emit/ACK；at-least-once + dedup = one effect
v1 不做：跨图知识图谱 / merge/reparent / 自动 OCR / 多设备 CRDT
```

## 端到端主流程（已自动化验证）

```
导入书籍 → parse（十阶段流水线，每 Block 生成一张初始 ContentGraph）
        → activate_graph → CONTENT_SNAPSHOT 推送 iPad
        → iPad BLOCK_VIEW → VIEW_COMMITTED → Mac 派生 Focus=Block
        → 用户 QA → 冻结 TurnContext → Responder 回答
        → Curator: NO_OP / EXTEND（追加 Segment）/ CREATE（新 Node + conditional nav）
        → GraphPatch → iPad local_revision 校验 → durable apply → ACK
        → END → Interest/Timing 更新 → Scheduler 选择下一本/旧内容重现
```

失败场景（09 失败矩阵）同样有测试覆盖：幂等重放不产生重复节点、revision mismatch 走快照恢复不盲写、stale conditional nav 不抢页、duplicate message one effect、journal 崩溃恢复。

## 目录

```
阅读系统/
├── 资料库/                    你的书籍（epub/txt/md 原生支持；pdf 尽力而为）
├── 提示词迭代库/               设计稿 + AI 提示词运行库（用户控制区）
├── 系统数据/                   Canonical Store + 状态库（系统控制区，勿手动编辑）
├── ReadingSystem-Mac/         成果 A：Mac 运行包（详见其 README）
└── ReadingSystem-iPad/        成果 B：iPad 客户端（详见其 README）
```

## 已知边界（v1 范围内，如实说明）

- **LLM 未配置时**运行在启发式模式：回答为原文摘录、Curator 极保守（几乎只 NO_OP/EXTEND）。配置 `readingsystem.config.json` 里的 LLM Key 后即为完整语义体验。
- **PDF**：带可读文本层的 PDF 可解析；嵌入字体 CID 编码的 PDF 会被质量闸门明确拒绝（提示换 EPUB），不产出乱码数据。
- **iPad 真机验收**：Pencil 落笔即写、Ink 长期稳定（EXTEND 零位移）必须在真实 iPad + Apple Pencil 上验收（模拟器不作为 Pencil Gate）。
- Xcode 首次使用需在终端执行一次 `sudo xcodebuild -runFirstLaunch` 安装系统组件。
