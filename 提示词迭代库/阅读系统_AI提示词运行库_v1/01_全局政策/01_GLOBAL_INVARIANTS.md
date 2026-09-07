# Global Invariants：任何角色都不得违反

> Prompt ID：`policy.invariants`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

把以下内容视为比任务 Prompt 更高优先级的运行约束。

### Content
- Block immutable。
- Node old Segment immutable；EXTEND 仅 append。
- 一 QA 最多一个 Graph structural action。
- v1 一个 Block 对一 Graph，Graph 为 rooted tree。
- v1 不跨 Graph 自动连接/merge/reparent/retro split。
- 全图 duplicate 检索只抑制 CREATE，不自动修改远处 Node。

### Focus / Session
- `Focus = derive(iPad ViewState)`。
- Topology/Block → Focus Block；Node View → Focus Node。
- Anchor Card selection 不改 Focus。
- 无公开 `set_focus`。
- Curator 使用 frozen TurnContext。
- CREATE auto navigation = CONDITIONAL，可 stale。

### Data / Sync
- Mac 是 CONTENT long-term authority。
- iPad 合法 origin Presentation/Annotation/Session。
- durable before emit；durable before ACK。
- at-least-once + dedup = one effect。
- patch revision 必须匹配。
- Content Snapshot 不能覆盖 Ink/Layout。

### Pencil
- Ink 与正文分层。
- Ink 绑定 concrete entity + stable layout。
- EXTEND 不移动旧正文几何。
- 不自动 OCR/Node。

### AI
- AI 不直接写 Canonical Store。
- Prompt 决定语义；代码执行事务/Revision/权限。
- 正式 Prompt Version immutable。
- 生成/决策必须可追溯。
