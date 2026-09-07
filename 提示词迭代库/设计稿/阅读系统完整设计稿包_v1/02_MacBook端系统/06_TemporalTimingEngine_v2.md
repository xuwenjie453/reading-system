# Temporal Timing Engine v2

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 职责分离
Interest Engine = 多感兴趣；Timing Engine = 何时重新具备候选资格；Scheduler = 当前是否真的插入。

`next_eligible_at ≠ actual_push_time`。

## Timing State
class、base/effective interval、last meaningful episode、last temporal push、next_eligible_at、cooldown_until、due_strength、exposure、skip streak、timing_generation、model_version。

## ACTIVE 基础间隔
初始锚点：100→3d；85→7d；70→14d；55→30d；40→60d。普通 Active 自动重现约限制 3–90d。

Modifiers：Historical high 略缩短；Confidence low 延长；recent system exposure 延长；Temporal skip 显著延长；first temporal cycle ×1.1–1.2；strong reengagement 轻微缩短。Manual Return 不计系统 exposure。

## Cooldown
必须同时 `now >= next_eligible_at` 和 `now >= cooldown_until`。Temporal SKIP 可设置数周 cooldown，防止高 Interest 马上重推。

## Manual Return
主动回访后旧 cycle 作废，Episode 完成后重生成。即使这次只看一下，也应避免系统近期马上再推。

## LONG_TERM
当前冷却但历史价值高：约 90–150d、150–240d、240–365d，多次拒绝可到 365–730d dormant。只有用户 SUPPRESS 才完全停止主动出现。

## DueStrength
eligible 后用于候选内部排序。概念：0.50 overdue urgency +0.30 current +0.15 historical +0.05 confidence，再加 exposure/dismissal adjustment。DueStrength 没有强制权。

## Jitter / 不漂移
Active ±10%、Long-Term ±15%，每 generation 固定一次。Lazy Interest decay 不得让既定 next_eligible_at 每天漂移。

用户 UI 不显示 overdue、复习任务或通知。
