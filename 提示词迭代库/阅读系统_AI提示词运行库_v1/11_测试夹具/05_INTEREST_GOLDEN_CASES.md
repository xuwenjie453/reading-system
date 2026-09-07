# Golden Cases：Interest Semantic Evidence

> Prompt ID：`fixture.interest`  
> 版本：`runtime-v1.0`  
> 模式：**TEST**  
> 日期：**2026-09-07**

### 长时间闲置
App 打开 30 分钟无互动。
Expected：不能因为 30 分钟明显提高 Interest。

### 难但着迷
多轮问题，friction 高，但不断 EXTEND/CREATE、自主反例、隔天回来。
Expected：progress/investment/return 高，不把 difficulty 当 disinterest。

### 难且卡住
重复同问、无 cognitive progress、最终 skip。
Expected：repetition/friction high，negative evidence high。

### 少问但长期回来
几乎不 QA，但跨周主动回访。
Expected：VoluntaryReturn 是强证据。

### crash
Episode 因进程中断。
Expected：不是 dismissal/skip。
