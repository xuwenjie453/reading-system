# 新 Layout 场景

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

Entity：
- annotationRevision == 0；
- 首次打开；
- 使用新“大字体 + 小 margin” profile。

期望：
- Text 正常；
- Canvas canonical；
- Pencil 正常；
- 一旦产生首笔 durable annotation，layoutEpoch/profile 被锁定。
