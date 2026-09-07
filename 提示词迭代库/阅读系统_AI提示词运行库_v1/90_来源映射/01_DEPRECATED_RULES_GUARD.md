# 历史废弃规则 Guard

> 版本：`runtime-v1.0`  
> 模式：**REFERENCE**  
> 日期：**2026-09-07**

运行时检测到以下旧表述时必须覆盖：

- `CREATE → 立即 set Focus=new node` → 错；应 conditional nav + VIEW_COMMITTED。
- `scope_summary` 作为隐藏独立字段 → 旧；统一 Anchor Summary。
- `必须先进入 Pencil 模式` → 旧；Pencil direct-write。
- `停留越久 Interest 越高` → 旧；precise dwell 极弱。
- `Working memory 固定分钟过期` → 旧；事件边界。
- `LastKnownFocus 离线自动写图` → 旧；禁止。
- `全图相似自动 EXTEND 远处节点` → 旧；禁止。
- `滚到底=END` → 禁止。
