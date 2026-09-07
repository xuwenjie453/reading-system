# Context Builder 与对话上下文管理

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 目标
模型不自行“读取所有历史”。Context Builder 为不同 Prompt Role 构造有来源、优先级、预算的 Context Package。

上下文类型：POLICY、USER_CURRENT、SOURCE、COGNITIVE_RECORD、CONVERSATION、DERIVED_METADATA。

## 权威
解释作者时：SOURCE > Block Summary > Node cognitive history > old AI conversation。ContentNode 是认知历史，可能包含错误，不是原文真相。

## Responder / Block Focus
默认：当前 Block 全文、必要 Context Envelope、当前用户输入、最近相关 QA、轻量 Graph catalog。

## Responder / Node Focus
默认：root Block、Node Title+Anchor Summary、recent Segments、semantic relevant historical Segments、ancestor summaries、recent QA、WorkingConversationDigest。

长 Node 不默认全文灌入。通常保留 Segment001 + 最近 2–4 + Top-K relevant；去重后按原时间顺序排列。

## Graph Context
小图可给所有 Title+Summary；大图给全图 Title catalog + Top-K relevant summaries + 必要正文。v1 不自动跨 Graph 检索。

## Conversation
Raw Conversation 主要承担短期语言连续性。重要 QA 一旦沉淀进 Canonical Node，长期上下文优先 Node。WorkingConversationDigest 是临时工作记忆，按 Graph/session/topic 等事件边界重置，不按固定分钟过期。

## Curator Context
frozen TurnContext + current QA + Responder Answer + Cognitive Delta + Focus summary/history + graph topology + duplicate candidates + depth/complexity/policies。

Curator final commit 前可读取最新 graph summaries 做 duplicate/revision revalidation，但 parent 永远来自 frozen TurnContext。

## Budget
永不先裁 system policy、current user、TurnContext、current source、focus anchor。优先裁低相关旧聊天、远祖先、siblings、过大 envelope、低相关旧 segments。

Context Builder 本身版本化并进入 provenance。
