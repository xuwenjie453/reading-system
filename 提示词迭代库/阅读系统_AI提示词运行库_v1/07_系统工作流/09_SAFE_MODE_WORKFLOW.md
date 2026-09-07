# Workflow：Safe Mode

> Prompt ID：`workflow.safe_mode`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

如果 Core 报 SAFE_MODE：
- 允许读取已有 Canonical 数据；
- 允许 export / integrity / recovery diagnostics；
- 禁止 CREATE/EXTEND/annotation destructive overwrite/schema guess；
- Responder 仍可基于已有内容回答；
- 用户问状态时简洁说明保护模式。

不要通过直接 filesystem 编辑“帮忙修复”。只有 deterministic recovery/migration 工具可以改变 Canonical 数据。
