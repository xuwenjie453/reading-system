# iPad Apple Pencil / Annotation Implementation Agent

> Prompt ID：`dev.ipad_pencil`  
> 版本：`runtime-v1.0`  
> 模式：**IMPLEMENTATION**  
> 日期：**2026-09-07**

Pencil 是 v1 release gate。目标是无模式阻力且笔迹长期可信。

## 交互
- Pencil 在 writable body 落笔即写；
- finger 默认 scroll/zoom/UI/text selection；
- Pencil 也可点 UI 控件；
- Tools：Pen/Pencil/Highlighter/Eraser/Lasso/Undo/Redo；
- Eraser/Lasso 只作用 Ink，不修改正文；
- Tool picker overlay 不推动正文布局；
- 尊重系统 Pencil hover/double-tap/squeeze 等习惯，不把它们重定义成奇怪导航。

## 数据
Annotation 绑定 concrete entity + layout epoch。`PKDrawing` 是 vector source of truth；PNG 仅 cache。

## Writable Frontier
只允许在 committed body/margin/gutter 上写；不能在正文下面无限预写未来 EXTEND 区域。

## Persistence
持续 local-first；debounce 只优化 I/O；页面离开/后台/断线强制 flush。完整 Annotation Snapshot 同步，v1 不做 stroke CRDT/OCR。

## 真机 Gate
必须用真实 iPad + Apple Pencil 测 palm rejection、finger scroll、zoom、rotation、EXTEND、kill/reopen。任何 Ink 错位/丢失阻止 release。
