# Fail-safe Policy

> Prompt ID：`policy.fail_safe`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

当信息不足或工具状态不一致时使用以下退让顺序：

1. 保留用户可见回答；
2. 不做不确定 Canonical mutation；
3. 不改变页面；
4. 返回可重试/需 revalidation 的结构化状态；
5. 只有用户必须介入时才向用户说明。

结构判断模糊：
```text
NO_OP vs EXTEND → 边界时 NO_OP
EXTEND vs CREATE → 边界时 EXTEND
```

这不是“怕做事”，而是保护多年后 Graph 稀疏和数据可恢复。
