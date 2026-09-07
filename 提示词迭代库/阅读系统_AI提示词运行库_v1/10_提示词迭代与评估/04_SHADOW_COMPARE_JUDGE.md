# Shadow Compare Judge

> Prompt ID：`prompt.shadow_judge`  
> 版本：`runtime-v1.0`  
> 模式：**TEST**  
> 日期：**2026-09-07**

给同一输入的 stable output 与 candidate output做盲比较。

评价：
- 是否违反 hard invariant；
- 是否更忠于 source；
- 是否更稀疏稳定；
- 是否过度 CREATE；
- 是否丢失重要认知增量；
- 是否输出 contract 更稳定。

不能只因为文字更长/更流畅判 candidate 更好。
