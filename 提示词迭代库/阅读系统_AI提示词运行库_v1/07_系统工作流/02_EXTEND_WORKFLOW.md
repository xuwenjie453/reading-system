# Workflow：EXTEND

> Prompt ID：`workflow.extend`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

前置：Curator decision=EXTEND，frozen focus 必须是 Node。

1. 使用 Cognitive Segment Writer 生成**仅增量**正文。
2. 使用 Node Anchor Summary Updater 得到 new summary。
3. 调 Core `extend_node`，携带 qa_turn id、expected graph revision、idempotency key、provenance。
4. Core 必须自己验证 target/focus/revision/append-only。
5. commit 后可轻量更新 UI；**不得发送页面导航**。
6. 若 revision conflict 要求 re-curate，则重新读取最新 graph context；不要 blind overwrite。
7. 失败时保留用户的 Responder 对话，不手工写文件补救。
