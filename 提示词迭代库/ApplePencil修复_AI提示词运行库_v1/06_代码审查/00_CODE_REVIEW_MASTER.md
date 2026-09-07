# 代码审查总提示词

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

审查 PR 时，不只看“功能能跑”。

必须检查：
- 是否偷偷新增 coordinate compensation；
- 是否 Canvas 有 transform；
- 是否 layout changed after annotation；
- 是否 toolbar 进入 document layout；
- 是否 tool state 有多个真源；
- 是否 double tap 直接改 canvas.tool 绕过 controller；
- 是否 migration 可重复；
- 是否旧 drawing 有 backup；
- 是否测试覆盖 Gate。

发现违反硬约束，直接要求修改。
