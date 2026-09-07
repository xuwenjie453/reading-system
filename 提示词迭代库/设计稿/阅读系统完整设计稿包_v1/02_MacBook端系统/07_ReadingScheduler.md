# Reading Scheduler 设计

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 只在 Graph 边界
Scheduler 不打断正在阅读的 Graph。主要触发：END_CURRENT_GRAPH、用户显式导航、session continue/start。

## 四轨
MANUAL、CONTINUATION、TEMPORAL、DISCOVERY。优先级：用户显式意图 > 明确 reading plan > continuation/temporal arbitration > discovery。

## Reading Context
SEQUENTIAL / MANUAL_BRANCH / FREE。临时跳 Graph42 时保留原 continuation anchor；只有“从这里继续”才改变主线。

## Read State
v1：UNREAD、ACTIVE、READ，没有 MASTERED。

## Continuation Momentum
与 Graph Interest 分开。连续 next、同书推进等形成 HIGH Momentum，Temporal 插入门槛提高。用户明确“下一块”时 Temporal 绝不能插队。

## Temporal Opportunity
连续若干新 Graph（软建议 2–4）或章节自然边界产生机会，但不是强制。Temporal burst v1=1；结束后回 continuation anchor。

## Entry
FRESH_PUSH → BLOCK_VIEW；TEMPORAL_PUSH → TOPOLOGY_VIEW。

## END vs SKIP
END 正常提交 Episode。SKIP 是“现在不想读”，Temporal Skip 更强负向；Fresh Skip 不标 READ。

## 用户命令
`下一块`=explicit continuation；`结束`=Scheduler 可自由；`结束，下一块`=原子 end_and_next；`今天只读这本书`=session temporal off；`给我一个以前感兴趣的内容`=TEMPORAL_ONE。
