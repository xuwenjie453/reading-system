# Apple Pencil 与 Annotation 系统

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 产品要求
目标是原生自由书写的低阻力感受，但不是复制无限白板。**Pencil 落笔即写**，不要求先进入绘图/Pencil 模式。

默认：Pencil → Ink/Tool；Finger → Scroll/Zoom/Text Selection/UI。

## 工具
v1 至少：Pen、Pencil、Highlighter、Eraser、Lasso、Undo/Redo。工具状态主要是 iPad 本地偏好。

## Annotation 不是 ContentNode
手写不自动 OCR、不自动 CREATE/EXTEND、不进入 Node Body。未来“理解我的手写”必须由用户明确请求。

## 绑定
AnnotationDocument 绑定 graph_id、entity_id/type、layout_epoch/profile、annotation_revision、writer_device_id/epoch、drawing hash。

## Source of Truth
`PKDrawing` vector data 是笔迹真源；PNG 只能作为可删除 preview cache。

## 本地保存
Pencil 内存实时更新，短 debounce 后 durable local save；页面离开、App background、disconnect 等事件强制 flush。debounce 只用于 I/O，不用于 Interest。

## Sync
v1 完整 Annotation Snapshot，不做 stroke-level CRDT。多个未 ACK revision 可 coalesce 到最新 Drawing。

## Single Writer
v1 一个主要配对 iPad 是 writer。若 writer lineage 冲突，保留 local/remote 两份，不 destructive merge。

## Interest
Pencil 只作为 NONE/LIGHT/MODERATE/HEAVY 粗粒度辅助证据，不按笔画数和书写秒数刷分。
