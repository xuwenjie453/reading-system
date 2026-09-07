# EXTEND 与 Pencil 安全接入 Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

收到 EXTEND：
1. Store commit；
2. if stroke/hover unsafe → queue visual append；
3. safe point 后新增 LayoutSegment；
4. 旧 segment geometry 不变；
5. Canvas height 只向下增长；
6. text/canvas 同步扩大；
7. viewport 不自动跳。

工具栏状态与 EXTEND 无关。
