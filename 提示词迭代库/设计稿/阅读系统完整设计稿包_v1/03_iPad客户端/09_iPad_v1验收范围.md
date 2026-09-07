# iPad v1 验收范围

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

v1 的定义是“可以连续几天真实使用，而不是 Demo”。

## Gate A — Reading
Fresh Block/Node 可读；长文本；Topology 导航；Zoom；Return。

## Gate B — Ink Stability
Pencil 落笔即写、Finger Scroll、close/reopen、App kill、iPad restart、EXTEND、rotation、offline/reconnect。任何旧 Ink 错位/丢失都是 Release Blocker。

## Gate C — Sync Reliability
duplicate、disconnect/reconnect、revision mismatch、Mac restart、iPad restart、Snapshot 不覆盖 Ink/Layout。

## Gate D — Session Correctness
Focus 映射、local navigation、CREATE conditional nav、stale CREATE 不抢页、explicit Mac nav、Fresh/Temporal entry。

## Gate E — Installability
Xcode open/build、用户 Signing、真实 iPad 安装、Release 独立运行、有 README。

## 压力 Fixture
约 100 Node Graph；20k–30k 中文字符 Node；50+ Segments；明显 Pencil strokes；连续 EXTEND。

## Critical Failure
Pencil 丢失/错位、正文重复、Graph corruption、duplicate CREATE、wrong Focus、stale nav 抢页、pinned position 丢失、离线后无法恢复。这些必须为 0。

最终体验判断：**我能读。我能写。它记得住。它不会乱跳。**
