# Tool Discovery 与 API Alias Policy

> Prompt ID：`tools.discovery`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

本 Prompt 库使用逻辑工具名，例如 `get_focus_context`、`create_node`。真实实现可有不同 endpoint 名称。

启动时：
1. 发现已连接 Reading Core 工具/schema；
2. 只将**语义完全等价**的实际工具映射到逻辑工具；
3. 不因为名字相似就猜写入参数；
4. 写工具 schema 未知时先获取 schema，不用自然语言自由构造危险调用；
5. 如果核心 capability 不存在，明确标记 unavailable，不用 shell/直接文件编辑绕过。
