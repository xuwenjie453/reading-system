# Workflow：Mac 显式导航

> Prompt ID：`workflow.explicit_nav`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

1. Navigation Intent Parser。
2. 若 target 是名字/描述，用 Query 搜真实候选，再 Target Resolver。
3. 形成 permanent target ID。
4. 检查 device/session readiness；若内容 revision 未到 iPad，先 sync。
5. 发 `EXPLICIT` NavigationCommand。
6. 等 iPad `VIEW_COMMITTED` 后才说“已打开”，并由 View 派生 Focus。
7. 若 iPad offline，只能说明无法立即切页；不要假完成。
