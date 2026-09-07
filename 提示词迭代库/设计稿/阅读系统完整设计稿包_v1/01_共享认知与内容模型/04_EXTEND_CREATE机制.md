# Graph Curator：NO_OP / EXTEND / CREATE

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 一轮一个动作
Responder 先正常回答；Curator 最多输出 NO_OP/EXTEND/CREATE 之一。一轮 QA 永远只有一个主认知产物。

## Cognitive Delta
Curator提取相对已有图真正新增的：用户理解/疑问/反驳/推论、系统新增解释、纠错/深化、打开的新问题。Node 只写 Cognitive Delta，不复制整轮聊天。

## ContentQuality Q
概念 0–100，考虑认知增量、用户贡献、系统解释增量、纠错/深化、未来回看价值。
初始：Q<45 NO_OP；45–55 通常 NO_OP；>=55 可考虑 EXTEND；CREATE 通常至少 >=60 才进入后续门控。

## Focus=Block
Block immutable，只有 NO_OP/CREATE，不存在 EXTEND Block。

## Focus=Node：ScopeFit
高 ScopeFit、同核心认知议题、独立回访价值不高 → EXTEND。若核心问题/认知操作明显转向、可以独立 Title/Summary、值得独立回访 → 考虑 CREATE。
模糊时：EXTEND > CREATE；NO_OP vs EXTEND 边界时 NO_OP > EXTEND。

## CREATE Depth Gate
| new depth | min Q |
|---:|---:|
|1|60|
|2|68|
|3|76|
|4|85|
|5|94|
|>5|禁止|

## Whole-Graph CognitiveCoverage
CREATE 前比较当前 Graph 所有 Node，不只兄弟。判断认知内容是否已被覆盖，而非简单主题相似。
- 主题相似、认知内容不同：可 CREATE；
- 已基本覆盖：抑制 CREATE；
- 相似但有重大新认知增量：可 CREATE，但门槛更高。

v1 绝不因此自动跳去/EXTEND/merge 远处 Node。

## NodeComplexity
综合正文量、子议题、认知转折、Anchor scope。高 complexity 略提高 EXTEND 门槛、增加 CREATE 倾向，但绝不 retro split。认知纯度优先于字数。

## EXTEND
目标必须是 frozen TurnContext.focus Node。新建 Segment，更新 Anchor Summary，Title/旧正文/Topology 不变，不导航。

## CREATE
parent 固定为 TurnContext.focus；原子生成 node_id/title/summary/segment1/edge/revision。**CREATE 本身不直接 set Focus**，只可产生 conditional navigation；iPad VIEW_COMMITTED 后 Focus 才改变。

## Audit
保存 qa_turn、decision、quality、scope_fit、branch_independence、duplicate coverage、depth、complexity、prompt/model/context provenance。
