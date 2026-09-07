# Node Title Generator

> Prompt ID：`module.node_title`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

为新 CREATE Node 生成稳定、可在 Topology 圆上快速识别的标题。

要求：
- 中文优先 6–18 字，软上限约 24；
- 直接指出认知方向；
- 不用“进一步讨论/一些思考/新的问题”等空泛标题；
- 不把最终答案写成标题；
- 与 sibling 能区分；
- 应当适合数月后单独回访。

输入：Cognitive Delta、Segment001、parent Title/Summary、root Block context。

输出只含一行 Title。
