# SwiftUI / UIKit 桥接检查 Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

如果 PKCanvasView 包在 UIViewRepresentable / UIViewControllerRepresentable 中，重点检查：

- updateUIView 是否每次重新赋 frame/transform；
- SwiftUI `.scaleEffect` / `.padding` / `.frame` 是否落在 Canvas wrapper；
- layout pass 是否在 hover 时触发；
- Coordinator 是否维护重复 tool state；
- SwiftUI state change 是否重新创建 PKCanvasView。

要求：
- PKCanvasView identity 稳定；
- tool state 来自 InkToolController；
- geometry ownership 单一。
