# Hover / Stroke 期间布局冻结 Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

增加 Reader mutation gate。

当：
```text
isPencilHoverActive == true
OR
isStrokeActive == true
```

禁止立即执行：
- font/profile change；
- canonical width change；
- canvas frame change；
- body geometry change；
- EXTEND UI append。

Store 层可先 commit 新 GraphPatch。

UI mutation：
```text
pendingReaderMutation
→ stroke/hover safe point
→ apply
```

注意：不要因为 hover 就永久阻塞 EXTEND；只需要延迟视觉几何更新到安全时机。
