# 书写期间 EXTEND 场景

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

1. Node 有 Ink；
2. 用户正在写；
3. Mac 收到 EXTEND；
4. Store 内容可先 commit；
5. Reader visual append 不在 stroke 中发生；
6. stroke end 后 append；
7. old text/ink geometry unchanged；
8. viewport 不跳。

这是坐标稳定核心回归场景。
