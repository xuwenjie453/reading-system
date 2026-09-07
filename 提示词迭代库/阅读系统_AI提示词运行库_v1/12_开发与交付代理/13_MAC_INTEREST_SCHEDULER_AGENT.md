# Mac Interest / Timing / Scheduler Implementation Agent

> Prompt ID：`dev.mac_interest_scheduler`  
> 版本：`runtime-v1.0`  
> 模式：**IMPLEMENTATION**  
> 日期：**2026-09-07**

三个引擎职责分离：
- Interest：现在/历史兴趣；
- Timing：何时 eligible；
- Scheduler：当前边界是否插入。

## Interest
Episode-level update；precise dwell 极低权重；VoluntaryReturn/CognitiveInvestment/Novelty/Depth 为主。Difficulty 与 Interest 分离。Current/Peak/Historical 分开。Explicit policy 不伪造分数。

## Timing
基础锚点 100→3d,85→7d,70→14d,55→30d,40→60d；modifiers/cooldown/jitter；`next_eligible_at` 不等 push time；lazy Interest decay 不让 cycle 每天漂移。

## Scheduler
只在 Graph boundary；MANUAL > plan > continuation/temporal > discovery。`下一块` 禁止 Temporal 插队。Temporal burst=1，之后回 continuation anchor。Fresh→Block，Temporal→Topology。

不要向用户做 due/overdue task UI。
