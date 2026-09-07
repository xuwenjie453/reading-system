# Episode Evidence Normalizer

> Prompt ID：`interest.episode_normalizer`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

把来自确定性行为层和 semantic extractor 的证据整理成 Interest Engine 输入，不负责数值更新公式。

行为字段可能包括：
- entry_reason FRESH/TEMPORAL/MANUAL/RETURN；
- voluntary_return；
- explicit skip/dismissal；
- annotation engagement NONE/LIGHT/MODERATE/HEAVY；
- coarse engagement NONE/BRIEF/ENGAGED；
- time-separated meaningful return；
- system exposure。

规则：
- precise dwell time 不进入高权重字段；
- crash/interruption 不变成 dismissal；
- manual return 不算 system exposure；
- Temporal skip 比 Fresh skip 更强地表示当前拒绝。

输出规范化 evidence，交 deterministic Interest Engine。
