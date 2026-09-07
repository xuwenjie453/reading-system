# Annotation 与 Presentation Layout 同步

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## Layout Domain
Topology 节点位置属于 PRESENTATION，独立 layout_revision。Node Position 使用 graph-space coordinates + AUTO/USER_PINNED。Drag 后 iPad 本地 persist，再发 LayoutPatch。Mac 持久化但不解释为 semantic parent 改变。

## Annotation Domain
v1 完整 Annotation Snapshot：annotation_id、entity、layout_epoch/profile、base/new revision、writer identity、hash、PKDrawing binary。

## Local First
```text
iPad Pencil → local durable → outbox → send
Mac validate → temp write → hash → atomic replace → ACK
```

## Coalescing
同一 annotation 多个未发送 revision 可保留 latest snapshot；同 Node 多次 layout drag 可保留最后位置。

## Conflict
v1 不做 CRDT merge。若 lineage/base 无法安全判断：保留 local 与 remote conflict copy，不静默覆盖。

## Domain Isolation
Content recovery 不得修改 Annotation/Layout。每个 Domain 独立恢复。
