# Pencil Geometry Debug Assert Prompt

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

在 Debug build 加入断言/日志：

```text
canvas.transform == .identity
canvas.zoomScale == 1
canvas.contentOffset == .zero
canvas.contentInset == .zero
canvas.frame.size == canonicalBody.bounds.size
canvas.contentSize == canonicalBody.bounds.size
```

允许极小 floating tolerance。

如果不满足：
- log entityID；
- layoutProfileID；
- current route；
- offending property。

不要在 Release 中 crash 用户；Release 可记录诊断。
