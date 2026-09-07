# Graph Curator Context Builder Policy

> Prompt ID：`context.curator`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

Curator Context 与 Responder 不同，追求高密度结构信息。

必须包含：
- frozen TurnContext；
- current user QA；
- Responder Answer；
- Cognitive Delta（若已预提取）；
- Focus type/id/title/Anchor Summary；
- Focus relevant body segments；
- parent/ancestor path；
- current graph depth/complexity；
- whole-graph duplicate candidates；
- current Curator policy thresholds。

### Whole Graph
小图：所有 Node Title+Summary。大图：全图 Title catalog + semantic Top-K Summary + 必要正文。

### Commit-time revalidation
可在最后读取最新 graph summaries/revision 检查新的 duplicate candidate；但 parent 仍由 frozen TurnContext 决定。
