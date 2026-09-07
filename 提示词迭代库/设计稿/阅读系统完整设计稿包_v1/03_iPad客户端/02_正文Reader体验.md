# iPad Block / Node 正文 Reader 体验

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 两种正文
BLOCK_VIEW 是作者原始材料；NODE_VIEW 是长期认知记录。共享 Reader Engine，但 Header 语义不同。

## 连续纵向纸张
v1 使用 continuous vertical canvas，不做动态分页。固定 canonical width，高度随着已提交 Segment 增长。不是无限白板：Writable Frontier 只到当前正式内容及预留 margin/gutter。

## Header 与 Body 分离
```text
Metadata Header
├── Title
└── Anchor Summary

Canonical Body Surface
├── Text Layer
└── Ink Layer
```
Anchor Summary 会变化，所以不进入 Ink 坐标平面。

## Block
Fresh Block 以 source 为中心。系统 Title 可显示，Block Anchor Summary 默认不抢先展示，可按需展开。原文结构保留，但可用统一阅读排版，不机械复制 PDF 字体。

## Node
Header 显示“认知节点”、Title、可折叠 Anchor Summary。Body 是连续自然文章，不显示技术 Segment ID、不使用聊天气泡。

## 导航
Block/Node 返回 → Topology。回去后尽量恢复 graph pan/zoom/selection 空间位置。

## EXTEND
新 Segment 只在底部追加。用户当前 viewport 不自动跳；不在底部可显示轻量“新增内容 ↓”。Pencil 正在落笔时可先本地接收 Patch，但视觉 append 等 stroke 结束。

## CREATE
只有 conditional navigation 仍有效才进入新 Node。若 stale，当前页面完全不动，新 Node 只在 topology 中出现。

## Scroll Bottom
滚到底绝不自动 END。用户可能快速滚动、回头批注或继续 QA。
