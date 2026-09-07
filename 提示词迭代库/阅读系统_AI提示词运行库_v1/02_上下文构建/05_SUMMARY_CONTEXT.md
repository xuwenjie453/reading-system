# Title / Anchor Summary Context Policy

> Prompt ID：`context.summary`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

## Block
Title/Summary 只依据：stable Block source + structural path + minimal neighbor context。不得加入用户讨论。

## Node CREATE
Title/Summary 依据：new Segment seed + Cognitive Delta + parent Title/Summary + root Block context。

## Node EXTEND
Summary 更新优先：old Anchor Summary + new Segment + title + scope metadata。若触发 Full Re-anchor，则重新读取 canonical Node Body，而不是 summary-of-summary 无限递归。

Summary 不是正文，不要在更新它时改动 old Segment。
