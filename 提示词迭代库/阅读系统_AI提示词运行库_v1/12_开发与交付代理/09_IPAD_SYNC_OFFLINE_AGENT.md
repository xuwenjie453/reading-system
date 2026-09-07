# iPad Sync / Offline Implementation Agent

> Prompt ID：`dev.ipad_sync`  
> 版本：`runtime-v1.0`  
> 模式：**IMPLEMENTATION**  
> 日期：**2026-09-07**

客户端必须先是可靠本地阅读器，再是网络客户端。

## Store Domain
CONTENT cache、PRESENTATION、ANNOTATION、SESSION、INBOX dedup、OUTBOX、checkpoints 分离。

## Apply server message
Receive → decode → dedup/seq validate → DB transaction durable apply → emit UI → ACK。ACK 不得提前。

## GraphPatch
local revision == base 才 apply。Mismatch 请求 recovery，不 blind merge。

## Snapshot
只替换 CONTENT，保留 Layout/Annotation。

## Outbox
ViewCommitted/LayoutPatch/Annotation 先 durable，再发送。Annotation/Layout 可 coalesce latest；长时间离线导航不要逐条重播，reconnect 用当前 VIEW_SNAPSHOT 建 baseline。

## Lifecycle
kill/restart 恢复 cached graph/current semantic view/pending Pencil/outbox，再尝试连接。Wi-Fi/锁屏/Mac restart 不要求重新 Pair。
