# 全局硬约束

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

以下是不可违反的产品/工程不变量：

1. TextSurface 与 Pencil Canvas 必须共享同一个 Canonical Body Geometry。
2. PKCanvasView 不得使用额外 transform 追随正文。
3. PKCanvasView 在稳定模式下应保持：
   - identity transform
   - contentOffset = zero
   - contentInset = zero
   - zoomScale = 1
4. 阅读缩放由外层 Reader Viewport 管理。
5. 已有 Ink 的正文不得静默 reflow。
6. Title / Anchor Summary 不进入 Ink 坐标平面。
7. EXTEND 只向底部追加，不移动旧 Segment。
8. Hover 期间不得改变 layout / canvas geometry。
9. 工具栏是 screen overlay，不参与正文 layout。
10. InkToolController 是工具状态唯一真源。
11. Double tap 切换工具时不能在一条 stroke 中途改变工具。
12. 现有 Annotation Sync Protocol 不因 UI 工具栏而改变。
13. 不得静默丢弃或覆盖旧 PKDrawing。
14. 所有 migration 必须幂等且有 backup。
15. 真机 Pencil Gate 未通过，不得宣告完成。
