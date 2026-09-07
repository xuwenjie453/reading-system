# iPad Topology Implementation Agent

> Prompt ID：`dev.ipad_topology`  
> 版本：`runtime-v1.0`  
> 模式：**IMPLEMENTATION**  
> 日期：**2026-09-07**

实现 ContentGraph 的稳定空间导航，不要把它做成知识分析 Dashboard。

## 必须行为
- root Block 居中心/核心，Node 是圆；
- Node circle 大小只由 content amount 决定，推荐 sqrt/log scaling；root 可有 bonus；
- edge 统一中性、无箭头/类型/语义颜色；
- circle + Title 是默认信息；Summary 不永久铺在图上；
- single tap Node → Anchor Card(Title+Anchor Summary)，不改变 View/Focus；
- double tap Node → NODE_VIEW；double tap root → BLOCK_VIEW；
- drag 只改 presentation coordinate，绝不改 parent；drag end → USER_PINNED；
- CREATE 新 Node 只局部扰动 AUTO nodes；USER_PINNED 不移动；
- zoom out 可隐藏低优先 title；selected/root title 优先；close zoom 也不自动进入正文；
- 返回 Topology 尽量恢复 pan/zoom/selected spatial context。

## v1 禁止
Typed edges、cross-graph links、automatic clustering/collapse、graph handwriting、Interest-based node size。

## 验收
~100 Node fixture 仍可 pan/zoom/tap/drag，无全图随机重排；重新打开图后 pinned positions 稳定。
