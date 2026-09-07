# Title 与 Anchor Summary

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## Title
Block Title 描述 source block 的核心动作。Node Title 识别稳定认知方向。要求高信息密度，避免“进一步讨论”。中文建议 6–18 字，软上限约 24。Node CREATE 时生成，EXTEND 默认不改。

## Anchor Summary
Node Anchor Summary 是动态认知锚点，回答：核心认知对象、用户的主要问题/理解/争议、覆盖范围、认知发展边界。不是单纯“最终答案摘要”。

典型长度：简单 40–60 字；常规 60–150；成熟复杂 150–250。

Block Anchor Summary 只总结作者/source；Node Anchor Summary 总结用户与系统围绕问题形成的认知空间。

Node 每次 EXTEND 后更新。长期增量更新可能漂移，因此复杂度跨档或累计多次更新时允许 Full Re-anchor，重新依据 Canonical Body 生成。

UI：Topology Anchor Card 显示 Title+Summary；Node Reader Header 可显示/折叠 Summary；Fresh Block 默认不突出 Summary。
