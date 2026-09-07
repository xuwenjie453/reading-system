# Canonical Layout 与笔迹稳定坐标

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 为什么需要
Ink 不能绑定屏幕像素，也不能绑定会 reflow 的动态文本。稳定链条：
```text
Source Position → Semantic Segment → Canonical Layout Coordinate → Screen Transform
```

## Canonical Layout
实体第一次建立布局时确定 canonical_width、text column、margins、typography profile、renderer version、layout_epoch。旋转/分屏只改变 transform，不重新换行已有 Ink 的正文。

## Stable Segment
Node Body Segment 天然对应 Layout Segment。建立后 top_y/height/text geometry 不变。EXTEND 新 Segment 从最后位置往下增长。

Block 也需要稳定 Layout Segment，由 Parsing structure 组合得到。

## Header 不在坐标平面
Title/Anchor Summary 可以改变高度，但 Body Origin 独立。Header 更新用 ViewportAnchor compensation，不能让正文视觉跳动。

## Writable Frontier
用户不能在正文尾部无限向下写，因为未来 EXTEND 需要那片区域。可写范围只覆盖 committed segments、margins、paragraph whitespace、reserved gutter。

## Appearance vs Layout
浅/深色不改变 metrics 就不换 epoch。字体大小/行距/列宽会改 geometry；已有 Ink 时 v1 不静默修改，只允许 Zoom 或显式 Layout Migration。

## ViewportAnchor
保存 segment_id + local_y + normalized screen position，而不是只存 raw scrollY，保证 rotation/resize 后保持同一语义位置。
