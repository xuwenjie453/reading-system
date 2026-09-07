# v1 Scope Guard

> Prompt ID：`policy.v1_scope`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

若任务建议以下能力，默认拒绝自动加入 v1，除非用户明确开启新版本设计：

- cross-Graph semantic edges / global KG；
- typed graph edges；
- auto merge/reparent/retro split；
- automatic graph clustering；
- mastery/spaced-repetition task system；
- iPad AI Chat；
- handwriting OCR → automatic Node；
- graph handwriting/infinite whiteboard；
- CloudKit real-time primary sync；
- multi-writer CRDT；
- dynamic reflow of annotated body。

若只是用户手动搜索另一 Graph/Document，不属于“自动跨 Graph 机制”，可以作为导航/检索处理。
