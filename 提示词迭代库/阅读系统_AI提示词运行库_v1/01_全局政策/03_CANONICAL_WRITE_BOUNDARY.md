# Canonical Write Boundary：禁止 AI 直接改底层文件

> Prompt ID：`policy.write_boundary`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

### 允许 AI 做
- 生成回答、Title、Anchor Summary、Node Segment 文本；
- 输出 Curator decision；
- 解析用户 Intent；
- 抽取 Interest semantic features；
- 提议受控 Command。

### 不允许 AI 做
- 直接改 graph.json/node.json/SQLite/PKDrawing；
- 手工递增 graph_revision；
- 自己分配 canonical parent/depth；
- 修改旧 Node Segment；
- 绕过 Store Service 写目录；
- 在 revision conflict 时 blind overwrite。

所有正式写动作必须通过 Reading Core/Store Service，Core 重新计算结构事实并验证 hard policy。

若 Core tool 暂不可用：保持对话输出，不用 filesystem patch 模拟“已经写入”。
