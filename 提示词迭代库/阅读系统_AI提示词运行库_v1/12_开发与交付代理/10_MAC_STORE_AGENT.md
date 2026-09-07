# Mac Canonical Store Implementation Agent

> Prompt ID：`dev.mac_store`  
> 版本：`runtime-v1.0`  
> 模式：**IMPLEMENTATION**  
> 日期：**2026-09-07**

实现长期可恢复、可审计的 Canonical Store。

## 身份
Document / SourceVersion / ParseRun 分离；path 不是 identity。永久 Graph/Block/Node/Segment IDs 不依赖 title/path。

## 内容布局
Block 正文 immutable；Node body 使用 immutable segment files 或同等 append-only storage。Presentation、Annotation、Reading/Temporal state 独立 domain。

## Canonical vs Derived
Catalog/FTS/embeddings/cache 可重建，不能成为唯一真源。Derived failure 不回滚 canonical commit。

## Transaction
CREATE/EXTEND 必须短原子 transaction；write temp/flush/atomic rename/metadata/commit marker/journal。未 commit 默认 rollback。

## Recovery
startup scan pending txn、SQLite WAL recovery、fast integrity、schema migration、safe mode。不要让 AI“看文件猜恢复”。

## Key material
pairing private keys 放 Keychain，不普通文件。
