# Reading Core / ReadingDaemon 确定性执行层

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 原则
```text
AI / Intent
→ Reading Core API
→ Policy + Revision + Capability Guards
→ Transaction
→ Canonical Store
```
AI 不直接写 JSON/Markdown/SQLite/PKDrawing。

## Query / Command
Query 无副作用：get_focus_context、get_graph、get_node、search、get_temporal_candidates。Command 显式改状态：create_node、extend_node、activate_graph、end_current_graph、skip_current_graph、parse_library、request_navigation。

## Graph 写能力
v1 正式语义写只有 CREATE/EXTEND，没有 delete/merge/reparent/retro split。

### CREATE validation
parent exists；parent=frozen focus；depth；one action per qa_turn；revision/revalidation；duplicate gate；provenance。

### EXTEND validation
target is Node；target=frozen focus；append only；old body immutable。

## Focus
Core API **不提供公开 `set_focus`**。导航通过 request_navigation，真正 Focus 来自 iPad View Commit。

## 幂等 / 并发
每个 Command 有 command_id、idempotency_key、correlation_id、causation_id、actor、expected_revision。qa_turn 的 graph mutation 重试只能产生一次效果。

Graph revision 变化时，若无关变化可 deterministic revalidate；若出现相关 duplicate candidate，返回 RECURATE_REQUIRED，不 blind overwrite。

## Capability
Responder 只读；Curator 提出 proposal；Mutation Executor 获得一次性 graph/turn scope。iPad 只能提交 View/Layout/Annotation，不得 CREATE Node。

## Event Bus
Command 是请求；Event 是已发生事实。Canonical commit 后 emit NODE_CREATED/GRAPH_MUTATED 等，Sync/Index/Session/Audit 订阅。Derived service 失败不回滚 Canonical commit。

## Fail Safe
无法安全决定时不 mutation。Responder 对话仍可保留，数据完整性优先。
