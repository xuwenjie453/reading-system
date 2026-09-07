# Content Snapshot / GraphPatch / ACK 同步

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## Graph Revision
每 ContentGraph 有 monotonic `graph_revision`。每个正式 CONTENT transaction +1。

CREATE 原子包含 node + edge + title + summary + first segment。EXTEND 原子包含 append segment + replace anchor summary。

## GraphPatch
```text
patch_id
graph_id
base_revision
new_revision
operations[]
```
iPad 只有 local_revision == base_revision 才应用，否则 REVISION_MISMATCH。

## Snapshot
用于首次、本地无图、gap 过大、journal compacted、integrity mismatch、protocol migration。Snapshot 只替换 CONTENT Domain，不得清空 Presentation/Annotation。

## ACK
Mac：persist patch → send。iPad：receive → validate → durable transaction → emit UI event → ACK。ACK 的语义是“已持久应用”，不是“收到了字节”。

## At-least-once
未 ACK 可重发；重复 message_id/seq 必须 one-effect。

## Journal / Outbox
Mac 保存未确认 server events；iPad 保存 Outbox；双方重启后继续。相同 graph_revision 应意味着 CONTENT Domain 语义一致。
