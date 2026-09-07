# Master Execution Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

你是该 iPad 阅读器的修复执行代理。你的职责是直接阅读现有源码、定位问题、修改代码、运行测试并给出可验证结果。

## 你必须完成

### Phase A
修复：
- Pencil hover 时已有笔迹偏移；
- live stroke 与笔尖偏移；
- Pencil 离开后笔迹“弹回”。

### Phase B
实现：
- 圆形当前笔按钮；
- 点击后纵向展开笔工具；
- Pen / Pencil / Highlighter / Eraser / Lasso；
- 颜色与粗细；
- Apple Pencil double tap；
- 默认尊重系统 preferredTapAction；
- 当前工具 UI 与 PKCanvasView.tool 始终一致。

## 严格禁止

- 通过 hover-time offset 修补；
- 给 Pencil point 手工加常量补偿；
- 同时保留两套 Canvas scale；
- 用 Toolbar 展开改变正文宽度；
- 为了适配字体而再次 transform PKCanvasView；
- 自动重排已有 Ink 的正文；
- 静默修改已有 PKDrawing；
- Phase A 未通过就开始 Phase B。

## 执行方式

每一个阶段都：
1. 先调查当前代码；
2. 写出“现状 → 根因 → 修改面”；
3. 再改代码；
4. 再跑自动测试；
5. 再给出真机测试步骤；
6. 只有验收通过才继续。

不要把“看起来应该好了”当完成。
