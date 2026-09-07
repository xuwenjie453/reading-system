# Bug Reproduction Fixture

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

复现场景：

1. 打开已有文章和已有 Pencil 笔迹；
2. 当前 UI 使用“大字体 + 小两侧留白”配置；
3. Pencil 远离时观察 Ink 正确；
4. Pencil 缓慢靠近正文；
5. 记录是否 Ink 偏移；
6. 写一个小圆；
7. 观察 live stroke 与笔尖；
8. 抬笔；
9. 观察是否跳回。

必须采集 Geometry Debug 值。

任何调查都先从此场景开始。
