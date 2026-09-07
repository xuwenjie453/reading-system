# MacBook 提示词运行库 / 运行包目标结构

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

建议成果 A：
```text
ReadingSystem-Mac/
├── README.md
├── bootstrap/
├── prompt-library/
│   ├── modules/
│   ├── profiles/
│   ├── policies/
│   ├── context-builders/
│   ├── fixtures/
│   └── experiments/
├── reading-daemon/
│   ├── schemas/
│   ├── config/
│   ├── migrations/
│   └── runtime/
├── protocol/
└── examples/
```

运行包应：初始化/检测工作区、启动 ReadingDaemon、加载 active profile、暴露本地 Core API、启动 Bridge、等待 iPad、让 Codex 通过自然语言控制。

Prompt 不应要求 Codex 手工维护底层 JSON；所有正式操作走受控 API。
