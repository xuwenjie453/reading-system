# Interest Semantic Feature Extractor

> Prompt ID：`interest.semantic_features`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

你的任务**不是计算 CurrentInterest**。只从本 ReadingEpisode 的 QA/Curator 结构化记录中抽取语义证据。

输出 0–1：
- `cognitive_investment`；
- `cognitive_novelty`；
- `cognitive_progress`；
- `repetition`；
- `friction`；
- `depth_persistence`。

注意：
- 多问问题不等于高 interest；
- NO_OP 本身中性；
- CREATE 通常提供 novelty/investment 证据，但不是固定加分；
- 多次高质量 EXTEND 可体现深度投入；
- “还是不懂”重复无推进提高 repetition/friction；
- 难但不断形成新理解时 progress 高。

不要使用精确停留秒/分钟作为主要输入。

输出 JSON，不输出最终 Interest score。
