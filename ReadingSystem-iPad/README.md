# ReadingSystem-iPad — 阅读系统 iPad 客户端

成果 B：完整 Xcode 工程，支持配对、Topology 内容图、稳定布局 Reader、Apple Pencil 手写、离线缓存、重连恢复、Snapshot/Patch 同步、会话导航。

## 用 Xcode 打开

```bash
open ReadingSystem.xcodeproj
```

1. 选择你的 iPad 作为运行目标（真机优先；Pencil 验收必须在真机做，Simulator 不能作为 Pencil Gate）。
2. Signing & Capabilities 里选择你的开发团队（`Signing & Capabilities → Team`）。
3. 直接 `Cmd+R` 运行。

首次运行会请求**本地网络权限**（用于 Bonjour 发现 Mac），请允许。

## 连接 Mac

1. 确保 iPad 与 Mac 在同一 Wi-Fi / 本地网络。
2. Mac 端启动守护进程：

   ```bash
   cd ../ReadingSystem-Mac
   node bin/readingsystem.mjs start
   ```

3. Mac 上生成配对码：

   ```bash
   node bin/readingsystem.mjs pair "我的iPad"
   # 📱 配对码：123456
   ```

4. iPad App 自动通过 Bonjour（`_readingsystem._tcp`）发现 Mac；若被防火墙拦截，在配对页切换「手动输入 IP」（端口默认 8732），填入 Mac 的局域网 IP。
5. 输入 6 位配对码完成配对。配对一次后自动重连（Wi-Fi 波动、Mac 重启都不需要重新配对）。

## 功能对照（v1 验收清单 iPad 侧）

| 功能 | 说明 |
|---|---|
| Fresh/Temporal 入口 | Mac `activate_graph` 推送 CONTENT_SNAPSHOT → BLOCK_VIEW / TOPOLOGY_VIEW |
| Topology | root Block 居中心；Node 圆大小只由内容量（sqrt）决定；single tap → Anchor Card（不改 Focus）；double tap → 进入节点；drag → USER_PINNED（本地立即持久化再同步） |
| Reader | continuous vertical canvas；Header 与 Body 坐标分离；EXTEND 只在底部 append，不在底部时显示「新增内容 ↓」；滚到底不自动 END |
| Pencil | 落笔即写（`drawingPolicy = .pencilOnly`），finger 滚动/选择；PKDrawing vector 是真源；debounce 只优化 I/O，后台/离开强制 flush |
| 离线 | 所有域本地 SQLite 先 durable；断开不回空白首页，缓存可读、可写（outbox） |
| 重连 | 新 session epoch → replay 未 ACK → VIEW_SNAPSHOT 建新 Focus baseline；旧 epoch conditional nav 全部作废 |
| 同步可靠性 | message_id dedup（重复投递 one effect）；GraphPatch 仅 `local_revision == base` 才 apply，否则请求快照；ACK 只在 durable apply 之后 |
| stale 导航 | CREATE 的 CONDITIONAL 导航只在 basis_view_revision 匹配时执行；用户已离开则页面不动，节点仍然创建 |

## 工程结构

```
ReadingSystem/
├── Protocol/Envelope.swift        与 Mac 共享的协议语义（Envelope/JSONValue/ContentSnapshot/NodeDTO）
├── Store/ClientStore.swift        本地 SQLite（actor）：CONTENT/PRESENTATION/ANNOTATION/SESSION/INBOX/OUTBOX
├── Connectivity/BridgeConnection  Bonjour(NWBrowser) + URLSessionWebSocketTask
├── Sync/SyncEngine.swift          dedup/epoch/apply/ACK/outbox/conditional nav
├── Views/
│   ├── RootView.swift             App Shell + 状态徽章 + 本地优先导航
│   ├── TopologyView.swift         内容图（Canvas + 手势）
│   ├── ReaderView.swift           稳定布局 Reader + PencilKit Ink Layer
│   └── PairingView.swift          配对
└── ReadingSystemApp.swift         入口
```

## 本地开发提示

- **没有 iPad？** Simulator 可以验证 Topology/Reader/同步语义（连同一台 Mac 的 daemon，主机名填 `localhost`）；但 Pencil/Ink 稳定性必须在真机验收。
- Mac 守护进程同时充当协议的"真实参考服务器"；本仓库 Node 测试（`ReadingSystem-Mac/test/bridge-e2e.test.mjs`）里有一个完整模拟 iPad 客户端，协议语义以它和 daemon 为准。
- 协议改动必须同时改 `ReadingSystem-Mac/src/bridge/bridge-server.mjs` 与 `ReadingSystem/Protocol/Envelope.swift`，保持共享契约一致。
