# Phase A 真机测试脚本

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

在真实 iPad 上：

### Existing Ink Hover
- 打开已有笔迹 Entity；
- Pencil 远离；
- 缓慢靠近不同位置；
- hover；
- 移开。
验收：已有 Ink 0 肉眼可见位移。

### Live Stroke
- 在文字旁写十字、圆和短字；
- 观察实时轨迹；
- 抬笔；
验收：无“写时偏、抬笔回正”。

### Page Position
顶部、中部、底部、左右 margin 各写一次。

### Zoom
多个 zoom level 重复 hover/write。

### Rotation
Portrait → Landscape → Portrait。

### EXTEND
有旧 Ink 的 Node 接收 EXTEND；旧位置 0 结构位移。
