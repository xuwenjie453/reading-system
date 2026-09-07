# Geometry Debug Overlay 实现 Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

实现仅 Debug build 可见的几何诊断层。

显示：
```text
Body size
Canvas frame/bounds
Canvas contentSize
Canvas contentOffset
Canvas contentInset
Canvas zoomScale
Canvas transform
Outer zoom
LayoutProfile
LayoutEpoch
```

可选显示：
- 当前 Pencil hover screen point；
- convert 到 CanonicalBody 的 point；
- convert 到 Canvas 的 point；
- 两者差值 Δx/Δy。

目标：
当任何 future layout 变更重新破坏坐标时，开发者可立刻看到。

Release build 默认完全隐藏。
