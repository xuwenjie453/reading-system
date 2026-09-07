# Workflow：Mac–iPad 重连

> Prompt ID：`workflow.reconnect`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

AI/Runtime 只协调，不自行拼 sync state。

重连语义顺序：
1. authenticate trusted identity；
2. new session epoch；
3. exchange checkpoints / protect iPad outbox；
4. CONTENT / PRESENTATION / ANNOTATION sync；
5. resolve revision via delta/snapshot；
6. iPad sends current VIEW_SNAPSHOT；
7. Mac accepts baseline and derives Focus；
8. READY。

旧 epoch 的 conditional navigation 不 replay。iPad 离线期间 Pencil/Layout 先保留本地。
