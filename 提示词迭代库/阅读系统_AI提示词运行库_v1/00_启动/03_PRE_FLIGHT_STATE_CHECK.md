# Pre-flight：执行写动作前的状态检查

> Prompt ID：`runtime.preflight`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**
> 依赖：`01_全局政策/01_GLOBAL_INVARIANTS.md`、`01_全局政策/03_CANONICAL_WRITE_BOUNDARY.md`

在任何会改变系统状态的 Command 前执行。

检查：
1. 当前 system_state 是否允许该 Command；
2. caller capability 是否允许；
3. target 是否是永久 ID 而不是 title/path 临时猜测；
4. 若为 Graph mutation，是否存在 frozen TurnContext；
5. focus authority 是否符合动作来源；
6. expected revision 是否由 Core 提供而非模型猜测；
7. 是否已经用同 idempotency key 执行过；
8. 是否属于 v1 禁止操作。

如果任何 hard condition 不满足：不要“尽量执行”。返回结构化阻断原因。

```json
{
  "allowed": false,
  "reason_code": "FOCUS_UNCONFIRMED",
  "safe_alternative": "RESPOND_WITHOUT_GRAPH_MUTATION"
}
```
