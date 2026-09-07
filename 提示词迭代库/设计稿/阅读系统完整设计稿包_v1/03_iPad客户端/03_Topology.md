# iPad ContentGraph Topology 设计

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 目标
Topology 是低信息密度的全局导航和旧认知重新激活界面，不是知识分析 Dashboard。

默认显示：circle + Title + parent-child edge。

## Root / Node
Block root 通常居中且略大。Node 大小只由内容量决定，不由 Interest/Quality/HistoricalImportance 决定。可使用 sqrt/log scale 并 clamp。

## Edge
统一中性线条：无箭头、无类型、无颜色语义，不标因果/反驳/支持。

## 交互
- single tap Node → Anchor Card（Title + Anchor Summary），Focus 不变；
- tap blank → deselect；
- double tap Node → NODE_VIEW；
- double tap Block → BLOCK_VIEW；
- drag Node → visual position only，变 USER_PINNED；
- pan/zoom → viewport only。

## Layout
rooted radial / outward stable layout。CREATE 只局部扰动 AUTO nodes；USER_PINNED 永远不被自动 layout 移动。稳定空间记忆是产品功能。

## Zoom
far：circle/edge、隐藏大量 Title；normal：circle/title/edge；close：仍不自动进入正文。进入正文必须 explicit gesture。

## v1 禁止
自动 cluster/collapse、semantic color、typed edge、cross-graph link、Topology handwriting。
