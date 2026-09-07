# Geometry Review Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

审查所有涉及：
```text
frame
bounds
transform
contentSize
contentOffset
contentInset
zoomScale
padding
scaleEffect
```
的变更。

对每一处问：
1. 作用于哪一层？
2. 是否改变 Canonical Body？
3. Text 与 Canvas 是否同时变化？
4. 是否有重复 transform？
5. 是否在 hover/stroke 时触发？

如果看到“为了让 Pencil 对齐增加 offset”：
> 高风险，要求解释并优先拒绝。
