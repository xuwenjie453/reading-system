# Phase A 系统提示词：Pencil 坐标修复

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

你现在只处理 Apple Pencil 坐标问题。

不要实现工具栏，不要改 double tap。

## 任务

定位并修复：
- hover 触发已有 ink 偏移；
- live stroke 与笔尖位置偏离；
- hover 结束后 drawing 恢复。

## 首要假设

优先怀疑：
1. PKCanvasView / ancestor transform；
2. Text 与 Canvas 宽度/scale 不一致；
3. contentSize/frame mismatch；
4. 外层 ScrollView 与 PKCanvasView 双 scroll；
5. PKDrawing.transform(using:) 补偿；
6. layout width / margin 修改后旧补偿仍存在。

## 输出要求

先给出源码证据，再改代码。

最终必须说明：
- 哪些文件是根因；
- 原来有哪几套 coordinate transform；
- 修复后唯一 coordinate path；
- 旧 annotation 是否迁移；
- 为什么 hover 和 final renderer 现在一致。
