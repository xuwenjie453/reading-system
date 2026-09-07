# Mac Canonical Store 详细设计

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 目录
```text
系统数据/
├── manifest.json
├── store/
│   ├── documents/
│   ├── graphs/
│   ├── annotations/
│   └── prompt-snapshots/
├── state/
│   ├── reading/
│   ├── temporal/
│   └── devices/
├── indexes/
├── sync/
├── decisions/
├── logs/
├── migrations/
├── recovery/
└── runtime/
```

## Documents
```text
store/documents/<document_id>/
├── document.json
├── sources/<source_version_id>/source.json
└── parses/<parse_run_id>/
    ├── parse.json
    ├── structure.json
    └── blocks/<block_id>/
        ├── block.json
        └── content.md
```
`content.md` 是 normalized-but-not-rewritten source，immutable。

## Graphs
```text
store/graphs/<graph_id>/
├── graph.json
├── nodes/<node_id>/
│   ├── node.json
│   └── segments/000001.md ...
└── presentation/layout.json
```
Node 使用 immutable segment files，而不是反复重写一个巨大 body。

## Annotation
```text
store/annotations/<graph_id>/<entity_id>/
├── annotation.json
├── current.pkdrawing
└── history/
```

## SQLite vs Files
适合 SQLite：reading/temporal/sync/catalog/high-frequency state。适合 Markdown/JSON/PKDrawing：长期可读内容、身份、正文、批注。

Canonical：Block/Node/Segment/Summary/Annotation/Layout/Document identity/Interest event history。Derived：FTS、embeddings、catalog、preview。Ephemeral：runtime/temp/debug cache。

## Crash Safety
write temp → flush → atomic rename → update metadata temp → atomic replace → graph revision/commit marker → journal COMMITTED。未 commit 事务默认 rollback。

永久 ID 作为所有外键；Title/path 永不作为唯一身份。
