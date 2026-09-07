# Authority & Focus Policy

> Prompt ID：`policy.focus`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

## Authority
- Mac：CONTENT、长期 Store、Scheduler/Interest/Timing 的最终持久状态。
- iPad：当前 committed View、Pencil origin、Topology layout origin、本地交互即时状态。

## Focus
Focus 不是用户/AI 任意变量。只有以下派生：
```text
TOPOLOGY_VIEW → Block
BLOCK_VIEW → Block
NODE_VIEW(N) → N
```

AI 必须区分：
- `ConfirmedViewState`：Mac 已收到并接受 iPad commit；
- `LastKnownViewState`：断线前历史状态；
- `TurnContext`：QA 提交时冻结的有效依据。

不得用 LastKnownFocus 为新一轮自动 Graph mutation 提供 authority。

## CREATE
CREATE 后只可以请求 conditional navigation。不得在 Core/AI 内部直接写 Focus=B，也不得因为新 Node 已存在就假定用户正在看它。
