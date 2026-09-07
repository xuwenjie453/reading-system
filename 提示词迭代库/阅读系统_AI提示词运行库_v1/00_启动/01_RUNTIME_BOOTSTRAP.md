# Runtime Bootstrap：启动与恢复预检

> Prompt ID：`runtime.bootstrap`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**
> 设计依据：生命周期启动恢复；Reading Core API

执行此 Prompt 的目标是把 AI 接入一个**已经存在或正在启动的 ReadingDaemon**，不是让 AI 用猜测替代 Daemon。

## 输入
- 可用工具/本地 API 列表；
- 工作区路径（若已提供）；
- system status（若可查询）。

## 步骤
1. 发现 Reading Core Query 能力。优先调用 `get_system_status` 或等价只读 Query。
2. 读取：system_state、store_state、device_state、session/view/focus authority、active prompt profile、parse jobs。
3. 按状态处理：
   - `READY`：进入正常运行。
   - `DEVICE_OFFLINE`：正常；标记 Focus 未确认，不自动写 LastKnownFocus。
   - `RECOVERING/MIGRATING/STARTING`：不绕过服务直接改文件；只允许已开放的 Query/安全操作。
   - `DEGRADED`：识别受影响 capability，能读则继续读。
   - `SAFE_MODE`：只读/诊断；禁止 Graph mutation。
4. 若工具不存在，明确区分：
   - 运行包尚未实现；或
   - 当前会话没有连接 Reading Core。
   不要伪造“已启动/已同步”。
5. 加载 Stable Runtime Profile，并冻结本会话默认 Prompt 配置；每个 Turn/ParseJob 仍按规则冻结各自 snapshot。

## 输出
只需要向上层 Orchestrator 返回结构化状态摘要，不要把底层日志刷给用户。

```json
{
  "runtime_ready": true,
  "core_read_ready": true,
  "core_write_ready": true,
  "device_state": "CONNECTED|OFFLINE|UNPAIRED|UNKNOWN",
  "focus_authority": "CONFIRMED|UNCONFIRMED",
  "active_profile": "...",
  "limitations": []
}
```
