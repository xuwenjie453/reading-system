# ContentGraph 与 ContentNode 设计

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## ContentGraph
每个 ContentBlock 唯一对应一张 ContentGraph，是阅读认知活动的基本单位。v1 rooted tree：Block root，Node 每个恰有一个 parent。Edge 只记录“该 Node 创建时从哪个认知焦点生长”，不表达支持/反驳/因果。

## ContentNode
不是 QA transcript，而是围绕稳定认知议题逐步追加的自然认知记录。允许保留用户/系统的错误，再由后续 Segment 纠正。禁止静默重写历史。

稳定字段：id、parent、old segments、created_at。动态字段：Anchor Summary、Complexity 等。Title 在 CREATE 时生成，通常稳定。

## Append-only
正文由 immutable Segment 组成。EXTEND 只追加一个新 Segment；旧 Segment 不改。这既保存认知演化，也保护 Pencil 坐标。

## Depth
Block=0；Node=parent+1。v1 CREATE 最大 depth=5。Depth 只抑制 CREATE，不限制对深层 Node 的 EXTEND。

## 稀疏原则
聊天可以丰富，图只沉淀值得长期回看的认知方向。图负责分叉，Node 负责同方向内部成熟。
