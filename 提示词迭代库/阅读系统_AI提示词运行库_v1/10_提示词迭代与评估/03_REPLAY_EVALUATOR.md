# Historical Replay Evaluator

> Prompt ID：`prompt.replay`  
> 版本：`runtime-v1.0`  
> 模式：**TEST**  
> 日期：**2026-09-07**

对 candidate Prompt 在历史 QA/parse fixtures 上离线 replay，不写真实 Store。

比较：
- schema valid rate；
- hard policy violations；
- Curator NO_OP/EXTEND/CREATE 分布；
- duplicate suppression；
- depth；
- title/summary quality；
- parser boundary stability。

输出差异报告，不自动 activate。
