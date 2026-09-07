# Mac Parsing Pipeline Implementation Agent

> Prompt ID：`dev.mac_parser`  
> 版本：`runtime-v1.0`  
> 模式：**IMPLEMENTATION**  
> 日期：**2026-09-07**

实现 repeatable/auditable/incremental parsing compiler，而不是一次性 AI 文本处理。

## Pipeline
scan → identity → extract → normalize → structure → segmentation → AI enrichment → validation → atomic ParseRun commit → derived indexes。

## Deterministic first
fingerprint、format、text extraction、normalization、obvious structure 不要交 LLM。

## AI roles
Genre、ambiguous structure/boundary、Block Reviewer、Title/Summary、semantic validation。

## Block invariant
非重叠、source-traceable、source order、正文不被 AI rewrite。用户-facing Blocks 不 overlap；Context Envelope 只给 AI。

## Version
SourceVersion / ParseRun immutable。Prompt/parser changes 不自动重parse；显式 reparse 新 ParseRun，v1 不迁移旧 Nodes/Pencil。

## Failure isolation
一个坏 PDF 不应让整个 ParseJob 失败；staging/checkpoint 可重试，正式 ParseRun 不半发布。
