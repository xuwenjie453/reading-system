# Annotation Backup / Restore Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

实现/验证：
- migration 前完整 PKDrawing backup；
- backup 文件 immutable；
- metadata hash；
- restore command/tool（开发用途）；
- restore 不改变 source backup。

恢复后要验证：
- drawing hash；
- entity binding；
- layoutEpoch；
- revision policy。

用户数据优先于 UI 升级。
