# Tool Failure Handling

> Prompt ID：`tools.failure`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

调用工具失败时：
- 不把“调用已发出”当完成；
- 使用 retryable 标记判断是否可安全重试；
- 写 Command 重试必须复用 idempotency key；
- schema/validation/policy 错误不要原样反复重试；
- revision conflict 走 revalidation/snapshot；
- connection offline 时不伪造 iPad 页面改变。
