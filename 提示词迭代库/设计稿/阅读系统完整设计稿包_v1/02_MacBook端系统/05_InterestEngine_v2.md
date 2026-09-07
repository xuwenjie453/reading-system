# Interest Engine v2

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 定义
Interest 是用户对某 ContentGraph 的持续认知吸引，不是掌握度、难度、客观重要性或内容质量。

每 Graph：CurrentInterest、PeakInterest、HistoricalImportance、InterestConfidence、TemporalClass、ExplicitTemporalPolicy。

## Episode 更新
不按每 QA `+5`。ReadingEpisode 结束时统一生成 Evidence 并更新一次。

## 正向证据
v2 重点：VoluntaryReturn、CognitiveInvestment、CognitiveNovelty、DepthPersistence、AnnotationEngagement、极弱 coarse engagement。

初始权重方向：0.32 回访、0.27 认知投入、0.16 新颖、0.15 深化、0.07 Pencil、0.03 coarse engagement。具体参数可调，但“事件质量远高于停留时长”不可改变。

## 秒/分钟停留时间正式降权
App 打开不表示一直读。不得用 7分42秒 vs 5分12秒明显推高 Interest。无交互长时间闲置不加分。时间最多粗分 NO_ENGAGEMENT/BRIEF/ENGAGED，权重极低。

## Difficulty 与 Interest 分离
维护 Repetition、Friction、CognitiveProgress。概念：`EffectiveFriction = Friction × (1 - CognitiveProgress)`。难且有推进可能是“着迷”；难且重复无推进才负向。

NO_OP 本身中性。Temporal SKIP/Dismissal 是清晰负向。

## Current / Peak / Historical
Current 有惯性与 lazy decay；初始可从约 45d 半衰尺度调试。Peak=max(old,new current)。Historical 由跨时间 meaningful return + 实质加工缓慢增长，v1 不普通衰减。

## Class
建议：进入 ACTIVE >=50；退出 <35；35–49 保持。LONG_TERM：当前低但 Peak/Historical 高。SUPPRESSED：用户明确不再自动推。

ExplicitTemporalPolicy 与心理分数分离；“以后多推”不能直接 set Interest=100。
