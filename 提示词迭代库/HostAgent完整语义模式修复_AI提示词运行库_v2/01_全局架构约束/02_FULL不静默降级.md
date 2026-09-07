# FULL 模式禁止静默降级

> 状态：**ACTIVE**  
> 运行库版本：**v2.0**  
> 生成日期：**2026-09-07**

FULL requested + no eligible executor：

```text
WAITING_FOR_EXECUTOR
```

不能自动变成 HEURISTIC。只有用户显式设置 ALLOW_HEURISTIC 才可 fallback。
