# Golden Cases：Graph Curator

> Prompt ID：`fixture.curator`  
> 版本：`runtime-v1.0`  
> 模式：**TEST**  
> 日期：**2026-09-07**

以下用于测试，不直接写 Canonical Store。

### Case A：Block 上简单词义
Focus=Block；用户问一个局部普通术语；回答简短且无独立回访价值。
Expected：NO_OP。Forbidden：EXTEND Block。

### Case B：Node 同议题纠错
Node=`先验与天赋知识的区别`；用户进一步理解“先于经验不是时间先在”，纠正此前误解。
Expected：EXTEND。

### Case C：Node 新独立方向
当前 Node 讨论自由定义；用户转向“自由为何是道德责任条件”，内容充分且未来可独立回访。
Expected：CREATE（前提 quality/depth gate）。

### Case D：远处已有完整覆盖
Focus=A，候选新方向已经由 Node F 完整承载。
Expected：抑制 CREATE；**Forbidden：自动 EXTEND F / 跳 F / merge**。

### Case E：depth>5
无论质量高低，Expected：CREATE forbidden；若同 scope 可 EXTEND，否则 NO_OP。

### Case F：用户提问后已导航
Curator 仍以 frozen A 做结构归属；不得把 parent 改成当前 C。
