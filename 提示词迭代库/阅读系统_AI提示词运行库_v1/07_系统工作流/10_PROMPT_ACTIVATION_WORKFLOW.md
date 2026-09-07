# Workflow：Prompt Profile 测试与激活

> Prompt ID：`workflow.prompt_activation`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

用户要求激活 Prompt 时：
1. 确认目标是 source package，不覆盖已注册 immutable version。
2. validate file/schema/placeholders/compatibility。
3. 运行 Golden + regression + historical replay。
4. Hard constraints 必须全通过。
5. compile/hash 生成 immutable Prompt Snapshot。
6. 原子切 active profile pointer。
7. 在途 QA/ParseJob 保持原 frozen snapshot；新任务用新 profile。
8. 不批量重写旧 Node/ParseRun。
9. 激活失败保留当前 stable profile。
