# iPad 客户端最终交付边界

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

成果 B 至少包含：
```text
ReadingSystem-iPad/
├── 完整 Xcode 工程
├── Client source
├── Local packages
├── Tests
├── Fixtures
├── MockReadingServer
└── README
```

README：Xcode 打开、Signing、真实 iPad 安装、首次 Local Network 权限、配对 Mac、常见连接恢复。

第一版不要求 App Store、公开账号体系、云端服务或多人协作。

Mock Server 必须能独立验证 Fresh push、Temporal push、EXTEND、CREATE、stale nav、duplicate、revision mismatch、disconnect/reconnect。
