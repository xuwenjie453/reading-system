# Golden Cases：Context Builder

> Prompt ID：`fixture.context`  
> 版本：`runtime-v1.0`  
> 模式：**TEST**  
> 日期：**2026-09-07**

### Source Explanation
用户：“作者这句话到底是什么意思？”
Expected：current source/block+envelope 高优先；旧 Node 历史降低。

### Cognitive History
用户：“我之前为什么会把先验理解成天赋知识？”
Expected：Node Summary + Segment001 + relevant old segments + recent segments；按 ordinal 排序。

### Long Node
14k tokens Node。
Expected：不默认全文；Summary+start+recent+relevant。

### Old AI Error
旧 Segment 错，后 Segment 修正。
Expected：检索/装配尽量包含后续纠正；Responder 不把旧错当 source。
