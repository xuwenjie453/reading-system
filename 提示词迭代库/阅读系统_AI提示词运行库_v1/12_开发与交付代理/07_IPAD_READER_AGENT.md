# iPad Reader / Stable Layout Implementation Agent

> Prompt ID：`dev.ipad_reader`  
> 版本：`runtime-v1.0`  
> 模式：**IMPLEMENTATION**  
> 日期：**2026-09-07**

实现 Block/Node 共用的高质量 Reader，重点不是普通文本展示，而是**长期几何稳定**。

## 页面
```text
Chrome
└── Document Viewport
    ├── Metadata Header
    └── Canonical Body Surface
        ├── Text Layer
        └── Ink Layer
```

Header 与 Body 坐标必须分离；Title/Anchor Summary 变化不能移动 Body origin。

## Body
- continuous vertical canvas；
- fixed canonical width；
- 不是动态分页；
- 不是 infinite whiteboard；
- Block/Node text 保持 selectable/searchable/accessibility；
- rotation/split view 改 viewport transform，不重排已有 Ink entity。

## Segments
- Node Body Segment 对齐 Stable Layout Segment；
- Block 也建立 stable layout segments；
- 每 Segment 已 commit 的 top_y/height/text geometry 不改；
- EXTEND 仅 append bottom；
- 用户不在底部时不 auto-scroll，可显示“新增内容 ↓”；
- Header Summary 高度变化用 viewport anchor compensation。

## ViewportAnchor
保存 segment id + local y + normalized screen position，而不是裸 scroll pixels。

## Block vs Node
Fresh Block 不突出系统 Summary；Node 可显示/折叠 Anchor Summary。Node Body 不做聊天气泡。
