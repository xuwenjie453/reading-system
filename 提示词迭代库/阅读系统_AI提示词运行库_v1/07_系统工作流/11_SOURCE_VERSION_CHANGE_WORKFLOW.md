# Workflow：Source 文件移动、修改、缺失

> Prompt ID：`workflow.source_version`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

- move/rename + same fingerprint → update location only。
- same path + different fingerprint → new SourceVersion；旧版本保留。
- source missing → mark MISSING；保留 Blocks/Graphs/Nodes/Annotations。
- same fingerprint returns → rebind。
- reparse 必须显式创建新 ParseRun；v1 不自动迁移旧 Node/Pencil 到新 parse。

AI 不得把“路径变了”误判为一本新书，也不得因为源文件删除就清理认知历史。
