# Workflow：完整 QA Turn

> Prompt ID：`workflow.qa`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

1. Task Router 判定 READING_QA。
2. Preflight 读取 `get_focus_context`，在用户提交瞬间冻结 TurnContext。
3. Context Router + Responder Context Builder 构造一致 Snapshot。
4. 调 Responder，先把回答交给用户。
5. 若 focus authority 允许，构建 Curator Context。
6. 调 Graph Curator。
7. `NO_OP` → 只记录 decision/audit。
8. `EXTEND` → Segment Writer → Anchor Summary Updater → `extend_node` Core command。
9. `CREATE` → Segment Writer → Node Title → Node Summary → `create_node` Core command。
10. Core commit 成功后同步自然发生；CREATE 可发 conditional nav。
11. 不等 auto-nav 才算 Node 创建成功；但不能在 View commit 前说 Focus 已改变。
12. 将 Interest semantic features 作为 Episode evidence 累积，不立即 set Interest。
