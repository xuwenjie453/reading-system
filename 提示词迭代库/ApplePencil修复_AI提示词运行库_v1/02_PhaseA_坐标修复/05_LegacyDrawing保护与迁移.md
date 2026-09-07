# Legacy PKDrawing 保护与迁移 Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

当前 bug 中 Pencil 远离时旧 Ink 位置正确，因此默认假设 PKDrawing 数据未损坏。

执行：

1. 备份原 PKDrawing blob；
2. 记录 hash；
3. 移除 runtime transform/offset；
4. identity Canvas 下重新加载原 Drawing；
5. 检查是否仍正确。

### 只有以下情况才允许 affine migration

能够明确证明：
- 旧 Drawing 数据一直在某固定 LegacyTransform 下展示；
- 这个 transform 对整个页面是统一线性矩阵；
- 文本没有发生非线性 reflow。

若满足：
```text
newDrawing = oldDrawing.transformed(using: verifiedTransform)
```

migration 只执行一次。

若字体 reflow：
> 不迁移，保留 legacy layout。

禁止“看起来差不多”地乘某个 scale。
