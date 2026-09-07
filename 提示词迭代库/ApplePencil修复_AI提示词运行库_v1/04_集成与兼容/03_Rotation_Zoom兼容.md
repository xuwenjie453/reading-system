# Rotation / Zoom 兼容 Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

Rotation / window resize：
- 不 reflow 有 Ink 的 body；
- 只改变 outer viewport transform；
- 使用 semantic viewport anchor 恢复位置。

Zoom：
- outer ReaderViewportScrollView；
- text + ink 一起 zoom；
- Canvas internal zoomScale 保持 1。

验证不同 zoom 下 hover/live stroke 仍对齐。
