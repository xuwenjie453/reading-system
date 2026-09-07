# Workflow：END / SKIP / NEXT

> Prompt ID：`workflow.end_graph`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

### END
- close current ReadingEpisode；
- commit semantic+behavior evidence；
- deterministic Interest Engine update；
- deterministic Timing Engine regenerate；
- Scheduler 选择 continuation/temporal/discovery；
- activate next Graph。

### SKIP
- outcome=SKIP；Temporal 与 Fresh 语义不同；
- Interest/Timing 由代码处理；
- Scheduler 选下一项。

### NEXT / END_AND_NEXT
- 用户显式 continuation；
- close Episode；
- Interest/Timing 正常更新；
- **跳过 Temporal competition**，直接 next continuation Graph。

AI 不手算分数或 next_eligible_at。
