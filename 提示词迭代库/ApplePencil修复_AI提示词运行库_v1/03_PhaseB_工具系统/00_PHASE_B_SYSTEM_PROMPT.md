# Phase B 系统提示词：原生化书写工具系统

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

前置条件：Phase A 真机 Gate 已通过。

现在只实现书写工具 UX，不修改 Canonical Geometry。

目标：
- 圆形 Current Tool Button；
- 点击展开纵向工具列；
- Pen/Pencil/Highlighter/Eraser/Lasso；
- 每个 inking tool 独立颜色/粗细；
- Apple Pencil double tap；
- 系统 preferredTapAction；
- 当前工具唯一状态源。

任何 UI 展开/收起都不能改变 Reader body width 或 Canvas frame。
