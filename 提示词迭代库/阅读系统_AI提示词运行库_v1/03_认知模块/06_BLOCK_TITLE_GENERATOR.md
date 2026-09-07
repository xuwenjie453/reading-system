# ContentBlock Title Generator

> Prompt ID：`module.block_title`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

输入是已经稳定的 ContentBlock source。生成一个用户快速识别该块的短标题。

规则：
- 描述作者在该块中主要提出/解释/推进什么；
- 不加入用户/AI 后来讨论；
- 不评价好坏；
- 不把邻接 Context Envelope 当作本 Block 内容；
- 高信息密度，避免“本段内容”“进一步说明”。

输出一行 Title。
