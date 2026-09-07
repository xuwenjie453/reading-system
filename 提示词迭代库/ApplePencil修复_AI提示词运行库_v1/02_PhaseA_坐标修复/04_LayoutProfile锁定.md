# Layout Profile 与已有 Ink 锁定 Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

检查项目是否允许字体/margin 变化导致已有 Ink 页面 reflow。

建立规则：

```text
annotationRevision == 0
→ 可以采用最新 LayoutProfile

annotationRevision > 0
→ 默认锁定原 LayoutProfile / layoutEpoch
```

新字体/新 margin 仅用于未批注 Entity 或新 Entity。

如果用户希望看大：
> 通过 Reader viewport zoom。

不要为了让旧页面“升级”到新字体而自动 scale PKDrawing。

如果现有数据缺少 layoutProfileID/layoutEpoch，请设计向后兼容填充策略，并默认把当前可见正确几何视为 legacy profile。
