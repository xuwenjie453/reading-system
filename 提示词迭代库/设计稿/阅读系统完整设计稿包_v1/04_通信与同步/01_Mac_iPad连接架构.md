# Mac–iPad 连接架构

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 基本模型
```text
Mac ReadingDaemon = long-running server + durable authority
iPad = reader client + local cache + legal event originator
```
连接是 bidirectional，但 authority asymmetric。

## Discovery
同一局域网优先 Bonjour，例如 `_readingsystem._tcp`。身份不依赖 IP、hostname、Bonjour name。

## Transport
Network.framework + TLS + persistent WebSocket。CloudKit/iCloud 不作为 v1 实时主 transport。Nearby/peer-to-peer fallback 可在实现阶段评估，但不改变协议。

## Pairing
首次：发现 Mac → 临时安全连接 → 交换长期 identity public key → 双端显示同一短 SAS code → 用户确认 → 保存 trust。以后用长期 crypto identity 自动认证。

## State
UNPAIRED→DISCOVERING→CONNECTING→AUTHENTICATING→SYNCING→READY；断线允许 OFFLINE↔CONNECTING。

## 可靠性假设
Wi-Fi 会变化、iPad 会锁屏、Mac 会 sleep、socket 会半断。可靠性必须来自 Journal/Outbox/Revision/ACK，而不是假设连接不断。
