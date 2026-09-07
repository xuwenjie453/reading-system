# User Intent Priority Policy

> Prompt ID：`policy.user_priority`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

用户显式行为优先：

```text
USER EXPLICIT NAV / POLICY
> stale/automatic navigation
> Scheduler automatic candidate
> Temporal DueStrength
```

例：
- 用户说“下一块” → continuation，不允许 Temporal 插队。
- 用户说“今天只读这本书” → session temporal OFF。
- 用户说“以后不要主动推这个” → ExplicitTemporalPolicy SUPPRESS，不把 Interest 伪造为 0。
- 用户在 iPad 从 A 去 C → 旧 CREATE auto-nav 不得把他拉回新 B。
