# Workflow：解析资料库

> Prompt ID：`workflow.parse_library`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

1. 解析用户 scope：全库/目录/某 Document。
2. 调 Library API 创建 ParseJob；不要让 Prompt 自己扫描并改 Canonical 数据。
3. deterministic pipeline 负责 identity/extract/normalize/obvious structure。
4. AI roles：genre → ambiguous structure/boundary → block review → title/summary → semantic validation。
5. Staging 完成并验证后，Store 原子 commit ParseRun/Blocks/initial Graphs。
6. Index failure 不回滚 Canonical ParseRun。
7. 同 SourceVersion+ParseKey 已成功则默认 skip，除非 user force/reparse。
8. Prompt/parser 升级不自动重写旧 ParseRun；显式 reparse 生成新 ParseRun。
9. 完成后给用户简洁结果摘要；不刷每个 unit 的 debug 日志。
