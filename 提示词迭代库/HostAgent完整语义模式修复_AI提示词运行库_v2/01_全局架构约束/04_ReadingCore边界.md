# Reading Core 边界

> 状态：**ACTIVE**  
> 运行库版本：**v2.0**  
> 生成日期：**2026-09-07**

Host Agent 可：
- query context
- claim work
- submit semantic result
- submit mutation proposal
- request navigation

不可：
- 直接改 graph/node 文件
- 改 revision
- set Focus
- 改 annotation blob
- bypass policy

正式写入仍是：
Semantic Proposal → Core Validation → Transaction → Store。
