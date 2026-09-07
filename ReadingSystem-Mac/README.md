# ReadingSystem-Mac — 阅读系统 Mac 运行包（ReadingDaemon）

成果 A：MacBook 端阅读系统运行包。确定性核心（Reading Core / Canonical Store / Parser / Interest / Timing / Scheduler / Bridge）+ AI Prompt Runtime（加载《阅读系统 AI 提示词运行库》，LLM 语义判断，无 Key 时启发式回退）。

## 快速开始

```bash
# 0) 初始化工作区（创建 系统数据/ 目录）
node bin/readingsystem.mjs init

# 1)（可选）配置 LLM —— 在工作区根目录创建 readingsystem.config.json
cat > ../readingsystem.config.json <<'EOF'
{
  "llm": { "baseUrl": "https://open.bigmodel.cn/api/paas/v4", "apiKey": "YOUR_KEY", "model": "glm-4-flash" }
}
EOF
# 不配置也能用：进入启发式模式（保守、可解释、边界一律 NO_OP）

# 2) 扫描/解析资料库（解析 用户触发，不自动后台解析）
node bin/readingsystem.mjs scan
node bin/readingsystem.mjs parse all          # 或某个文件的路径；--force 强制重解析

# 3) QA 问答（含 Curator 结构更新）
node bin/readingsystem.mjs ask "这一章的核心论证是什么？"
node bin/readingsystem.mjs chat               # 交互模式（/next /end /skip /temporal）

# 4) 启动守护进程（Reading Core + Bridge + Bonjour，等待 iPad）
node bin/readingsystem.mjs start

# 5) 配对 iPad
node bin/readingsystem.mjs pair "我的iPad"    # 6 位配对码，iPad 端输入
```

## 架构（对应设计稿子系统清单）

| 子系统 | 文件 | 说明 |
|---|---|---|
| Canonical Store | `src/store/canonical-store.mjs` | 文件式真源（documents/graphs/annotations）+ 原子事务（temp→flush→rename→commit marker→journal）+ 启动恢复 + fast integrity |
| State DB | `src/store/state-db.mjs` | SQLite（WAL）：session/viewstate/qa_turns/幂等表/sync journal/interest/timing/audit |
| Reading Core | `src/core/reading-core.mjs` | Query（无副作用）+ Command（preflight 八项/幂等/能力守卫）+ 状态机（READY/SAFE_MODE/…） |
| Focus 派生 | `src/core/focus.mjs` | `Focus = derive(iPad ViewState)`；无公开 set_focus；Confirmed/LastKnown/TurnContext 三态 |
| Graph Service | `src/core/graph-service.mjs` | CREATE/EXTEND 事务；revision/depth gate（60/68/76/85/94）/一轮一动作/append-only 由 Core 强制 |
| 解析流水线 | `src/parser/*` | scan→identity→extract→normalize→structure→segmentation→AI enrichment→validation→atomic commit→indexes；EPUB/MD/TXT 原生支持，PDF 尽力而为+质量闸门（CID 编码乱码明确拒绝，不写假数据） |
| Prompt Runtime | `src/ai/*` | 加载运行库（按 Prompt ID 精确加载）→ 编译 immutable Snapshot（hash）→ active Profile 指针；Context Builder 带权威标签与预算；LLM 走 OpenAI 兼容 API |
| QA Turn | `src/ai/qa-turn.mjs` | 冻结 TurnContext → Responder → Curator（schema+hard policy 双验证）→ mutation 交 Core → CREATE 才有 conditional nav |
| Interest/Timing/Scheduler | `src/interest/engines.mjs` | Episode 级更新（0.32/0.27/0.16/0.15/0.07/0.03 权重）；锚点 100→3d…40→60d；DueStrength 0.50/0.30/0.15/0.05；Scheduler 只在 Graph boundary，`下一块` 禁止 Temporal 插队 |
| Reading Bridge | `src/bridge/*` | WebSocket（零依赖 RFC6455 实现）+ dns-sd Bonjour + 6 位配对码 + session epoch + server_seq journal（durable before emit）+ GraphPatch/Snapshot/NavigationCommand/VIEW_COMMITTED |
| 生命周期 | `src/daemon.mjs` | Store→恢复→integrity→服务→Bridge→READY 严格顺序；单实例；clean shutdown marker |

## 工作区布局

```
阅读系统/
├── 资料库/               用户控制：原始书籍
├── 提示词迭代库/          用户控制：Prompt source（运行时按 ID 加载）
├── 系统数据/              系统控制：
│   ├── manifest.json
│   ├── store/{documents,graphs,annotations,prompt-snapshots}
│   ├── state/reading-state.db     （SQLite WAL）
│   ├── indexes/ sync/ decisions/ logs/ migrations/ recovery/ runtime/ journals/
└── readingsystem.config.json      用户配置（LLM Key 等）
```

## 语义模式（v2：FULL ≠ API Key）

```bash
node bin/readingsystem.mjs semantic status              # 模式/执行者/可用性
node bin/readingsystem.mjs semantic mode FULL           # FULL 或 HEURISTIC
node bin/readingsystem.mjs semantic policy AUTO         # HOST_ONLY|HOST_PREFERRED|AUTO|EXTERNAL_ONLY
node bin/readingsystem.mjs semantic fallback ALLOW_HEURISTIC   # 显式允许回退（默认 WAIT_FOR_EXECUTOR）
node bin/readingsystem.mjs semantic external configure <key>  # Keychain 存凭证（optional）
```

- Host Agent 接入（零 API Key）：`node bin/rs-agent.mjs attach` → daemon 状态 READY_HOST；
  Agent 通过 `rs-agent work list/claim` 认领语义工作，执行阅读系统提示词后
  `rs-agent work submit --file result.json` 提交结构化结果（方向唯一：Agent 主动 claim）。
- 语义运行状态与 daemon/iPad 健康分离：Host 离线不影响 Store/Bridge/iPad。
- 旧 `llm.apiKey` 配置自动迁移：凭证入 Keychain、从 config 移除、外部调用不自动启用。

## 测试

```bash
npm test        # 33 项：Graph 不变量 / 幂等重放 / 深度门槛 / Focus 派生 / Timing 锚点 /
                #      解析 / QA Turn / journal 崩溃恢复 / 端到端（真实 WebSocket 模拟 iPad）+
                #      HostAgent v2 验收（A-H + Release Blockers：FULL 无 Key / Host 切换与离线 /
                #      Background parse 经 Host works / Tier B 不假执行 / 重复提交一次 effect /
                #      config 迁移 NoSurpriseBilling）
```

## 运行库提示词

Prompt Runtime 直接读取 `提示词迭代库/阅读系统_AI提示词运行库_v1/`（按 `PROMPT_MANIFEST` 的逻辑 ID 映射）。修改运行库文件后：

```bash
node bin/readingsystem.mjs serve-core &
curl -s 127.0.0.1:8731 -X POST -d '{"kind":"command","name":"compile_profile_snapshot"}'   # 重新编译快照
curl -s 127.0.0.1:8731 -X POST -d '{"kind":"command","name":"activate_profile_snapshot","params":{"snapshot_id":"snap_xxx"}}'
```

已注册版本 immutable；activation 是指针切换；回滚只切指针，不回滚历史产物。
