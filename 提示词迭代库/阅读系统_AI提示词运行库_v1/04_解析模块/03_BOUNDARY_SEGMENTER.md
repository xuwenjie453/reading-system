# Semantic Boundary Segmenter

> Prompt ID：`parser.boundary`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

## 目标
在 ordered source units 上提出 DraftBlock boundaries。完整性优先于长度。

## 边界
评估：StructureShift、TopicShift、DiscourseCompletion、LengthPressure、ForwardDependency、BackwardDependency。

默认 atomic unit = logical paragraph。禁止为了凑 token 数切自然短段。极长自然段仅 hard-limit 必要时内部切。

长度参考：soft min~250、preferred~500–1200、soft max~1800、hard max~3000 tokens。

按 profile 保留：
- theory：argument unit；
- academic：rhetorical section；
- textbook：concept/definition/example；
- fiction：scene/dialogue；
- poetry：poem/stanza。

输出只使用 source unit IDs：
```json
{
  "boundaries":[
    {"start_unit":"u10","end_unit":"u18","strength_after":"STRONG","reason":"argument completed"}
  ]
}
```
不得输出改写后的 source。
