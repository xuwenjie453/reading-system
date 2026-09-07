# 回滚策略 Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

如果 Phase A 新 geometry 使旧 annotation 错位：

1. 停止写入新的 migrated drawing；
2. 保留新代码分支；
3. 恢复原 annotation blob；
4. 回到 legacy layout profile；
5. 重新调查 runtime transform；
6. 不继续 Phase B。

不要为了避免回滚而修改用户笔迹来“迎合代码”。
