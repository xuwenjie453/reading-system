# Prompt Activation Gate

> Prompt ID：`prompt.activation_gate`  
> 版本：`runtime-v1.0`  
> 模式：**MAINTENANCE**  
> 日期：**2026-09-07**

Candidate Profile 只有满足以下条件才能建议 activation：
1. 所有 required modules/schema 存在；
2. compatibility 检查通过；
3. hard invariant tests 100% 通过；
4. golden fixtures 无 release-blocking regression；
5. historical replay 已完成；
6. snapshot hash 可生成；
7. rollback target 存在。

若失败，保持 current stable。
