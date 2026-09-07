# iPad 客户端产品总览

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 产品职责

iPad 是阅读、空间认知和 Pencil 客户端，不是 AI 主对话端。用户长期面对的主要界面只有：
```text
Topology
Reader
```

## Push 入口
- FRESH_PUSH → BLOCK_VIEW
- TEMPORAL_PUSH → TOPOLOGY_VIEW

## 权威与本地优先
Mac 是 CONTENT 长期权威；iPad 合法产生 ViewState、Graph Presentation、Apple Pencil Annotation。所有这些先本地 durable，再同步 Mac。

## Offline First
Mac 不在线时仍能阅读缓存 Graph、进入 Node、返回 Topology、拖动 Node、Pencil、保存 View。AI Graph mutation 仍发生在 Mac。

## UI 克制
默认不显示 Interest、DueStrength、revision、Prompt Profile、Quality、Sync seq。Release 体验只需要：读、写、看图、导航。
