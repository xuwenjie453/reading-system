# 资料解析与 ContentBlock 设计

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## Parsing 流水线
```text
scan → identity → extract → normalize → structure → semantic chunk → validate → title/summary → initial graph → commit
```

## 文件身份
路径不是身份。移动/重命名且 fingerprint 相同只更新位置；文件内容变化创建新 SourceVersion；旧 ParseRun 不覆盖。

## 支持格式
v1：PDF、EPUB、TXT、Markdown、MOBI。PDF 优先文本层，OCR 只在必要时 fallback，并记录 extraction method/confidence。

## Normalization
允许 Unicode/空白/人工断行/页眉页脚等清理；禁止改写作者句子。保留 source locator/source map。

## 结构优先分块
默认原子单位是逻辑段落。Boundary：STRONG/MEDIUM/WEAK。语义和论证完整性优先于长度。

建议起始范围：soft min ~250 tokens；preferred ~500–1200；soft max ~1800；hard max ~3000。极长自然段才内部切分。

## Genre Profiles
至少：THEORETICAL、ACADEMIC、TEXTBOOK、FICTION、ESSAY、POETRY、GENERAL。理论类偏 argument unit；小说偏 scene；教材偏 concept/definition/example；诗歌保留 poem/stanza。

## Review
DraftBlock Reviewer 只允许 KEEP/MERGE/RESPLIT，不允许 rewrite source。正式 commit 前验证 coverage/order/non-overlap/source traceability/dangling dependency/title-summary。

## ContentBlock
Block body immutable。正式 Block 同时创建初始 ContentGraph，只有 root Block。Block Title 快速识别；Block Anchor Summary 只描述 source，不混用户/AI 认知历史。
