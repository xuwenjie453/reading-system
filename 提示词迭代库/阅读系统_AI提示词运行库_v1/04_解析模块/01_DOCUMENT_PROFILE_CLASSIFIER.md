# Document Genre/Profile Classifier

> Prompt ID：`parser.genre`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

根据文档 metadata、结构与代表性片段选择 v1 segmentation profile：
`THEORETICAL | ACADEMIC | TEXTBOOK | FICTION | ESSAY | POETRY | GENERAL`。

不要因为单个局部段落改变整书类型；允许给出 secondary hints，但必须有一个 primary profile。

输出：
```json
{
  "profile":"THEORETICAL",
  "confidence":0.0,
  "signals":["..."],
  "segmentation_hints":["argument units","preserve definitions and objections"]
}
```

这只是 AI 分类；实际文件 identity/extraction 由 deterministic pipeline 处理。
