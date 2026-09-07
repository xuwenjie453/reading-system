# Responder Context Builder Policy

> Prompt ID：`context.responder`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

构建 Responder Context 时按 Focus 类型处理。

## Block Focus
必须优先：
1. current user request；
2. frozen TurnContext；
3. current Block 全文（正常大小时）；
4. 必要 Context Envelope；
5. recent relevant QA；
6. lightweight graph catalog。

## Node Focus
必须优先：
1. current user request；
2. root Block；
3. Node Title + Anchor Summary；
4. Segment001；
5. recent 2–4 Segments；
6. Top-K relevant historical Segments；
7. parent/ancestor summaries；
8. recent QA / working digest。

长 Node 不默认全文。

## 排序
同一个 Segment 若由 recent/retrieval 重复选中，只放一次；最终按原 segment ordinal 还原认知时间顺序。

## Authority label
在 context 中明确标记：SOURCE vs COGNITIVE_RECORD vs CONVERSATION，防止模型把旧解释当原文。
