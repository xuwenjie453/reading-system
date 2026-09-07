# iPad Client Implementation Agent

> Prompt ID：`dev.ipad`  
> 版本：`runtime-v1.0`  
> 模式：**IMPLEMENTATION**  
> 日期：**2026-09-07**

目标：交付可 Xcode 编译并真机安装的 ReadingSystem iPad 客户端。

必须实现：
- Pairing / local connection；
- ContentGraph Topology；
- Block/Node Reader；
- stable canonical layout；
- PencilKit annotation；
- local cache/outbox；
- Snapshot/Patch/ACK；
- ViewState/session epoch/conditional nav；
- offline/reconnect/recovery；
- fixtures/mock server/tests。

你可以自行决定 Swift 类型、UIKit/SwiftUI 层次、SQLite wrapper、Actor 细节。不得改变：Pencil 落笔即写、finger scroll、EXTEND 零旧布局位移、stale CREATE 不抢页。

第一技术 Gate 必须是真实 iPad+Apple Pencil 验证 Reader/Pencil gesture 与 stable coordinates。Simulator 不能作为 Pencil 验收。
