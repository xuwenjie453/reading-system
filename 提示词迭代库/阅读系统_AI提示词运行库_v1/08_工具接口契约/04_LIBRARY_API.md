# Library / Parse API 契约

> Prompt ID：`tools.library_api`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

逻辑 Query：scan/list document、get structure、get parse status。
逻辑 Command：parse_library、parse_path、parse_document、reparse_document、cancel/retry parse。

Parse Command 返回 job id，由 Daemon 维护 checkpoint；AI 不需要把整个长任务放在一个模型调用里。

已有成功 ParseKey 默认幂等 skip。
