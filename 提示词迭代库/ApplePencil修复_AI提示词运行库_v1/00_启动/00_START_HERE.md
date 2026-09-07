# START HERE：Apple Pencil 修复执行入口

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

你正在修改一个已经存在的 iPad 阅读器项目。目标不是重新设计阅读器，而是严格完成两个子系统：

1. **Phase A：修复 Apple Pencil hover / live stroke 坐标偏移。**
2. **Phase B：加入接近无边记的书写工具交互。**

必须按顺序完成。Phase A 未通过真机 Gate，禁止进入 Phase B。

## 执行原则

- 先读本目录和 `01_全局硬约束/`。
- 然后进入 `02_PhaseA_坐标修复/`。
- Phase A 真机验收通过后才进入 `03_PhaseB_工具系统/`。
- 所有改动都必须通过 `05_测试与验收/`。
- 不要重新发明数据模型，不要擅自修改同步协议。
- 现有 Pencil 数据优先保护，任何修复不得以丢失/错位旧 Ink 为代价。

## 最高级目标

最终体验必须满足：

```text
Pencil 远离 → Ink 正确
Pencil hover → Ink 不移动
Pencil 落笔 → live stroke 紧贴笔尖
Pencil 抬起 → stroke 不二次跳动
双击 Pencil → 橡皮
再双击 → 回到原书写工具
```

## 如果仓库状态与设计冲突

优先级：

```text
数据安全
> 本运行库硬约束
> 当前 iPad 实际行为
> 旧实现便利
```

如果发现某个旧实现依赖危险 transform 才“看起来正常”，不要继续叠补偿；应恢复单一 Canonical Coordinate Space。
