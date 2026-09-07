# Workflow：CREATE

> Prompt ID：`workflow.create`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

前置：Curator decision=CREATE，duplicate/depth gate 通过。

1. Segment Writer 生成 Segment001。
2. Node Title Generator。
3. Node Anchor Summary Generator。
4. 调 Core `create_node(parent=frozen focus, ...)`。
5. Core 分配 node_id、计算 depth、验证 one-action/revision、原子 commit。
6. commit 后等待 Content sync 可用。
7. 如果用户仍在 TurnContext basis view，发 CONDITIONAL navigation；否则不导航。
8. 即使 navigation stale，Node 仍保持已创建。
9. 只有 iPad VIEW_COMMITTED(new node) 才更新 Mac ConfirmedView/Focus。
