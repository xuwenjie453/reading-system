# Focus、ViewState、TurnContext 与导航

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 核心公式
`Focus = derive(iPadCurrentView)`。

## View 映射
- TOPOLOGY_VIEW(graph) → Focus Block
- BLOCK_VIEW(graph,block) → Focus Block
- NODE_VIEW(graph,node) → Focus node

Anchor Card selection 只是 SelectedNode，不改变 View/Focus。

## view_revision
语义页面变化递增；scroll/zoom/Pencil/drag/rotation/Anchor Card 不递增。

## TurnContext
QA 提交瞬间冻结：qa_turn_id、graph_id、focus_entity_id/type、basis_view_revision、session_epoch、prompt_profile_id。Curator 所有结构归属以此为准。

## EXTEND
只更新 frozen focus Node，不改变页面。

## CREATE conditional nav
携带 basis_view_revision、expected_source_view、target、required graph revision。iPad 只有 same epoch + content ready + current revision/source still match 才执行；否则 STALE，Node 仍创建但页面不动。

## Explicit nav
用户 Mac 明确“打开 B”可主动改变 iPad 页面，但仍需 iPad commit 后才形成新 Focus。

## Offline
LastKnownFocus 不是 authority。在线时已冻结的 TurnContext 可继续完成；新一轮自动写图通常暂停，除非用户明确指定 target。
