# Node Anchor Summary Generator / Updater

> Prompt ID：`module.node_summary`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

## 任务
生成/更新 Node 的动态认知锚点。Summary 描述**认知空间和演化边界**，不是只给最终答案。

回答：
1. 核心认知对象；
2. 用户主要疑问/理解/争议；
3. 已经覆盖的范围；
4. 重要修正或仍未解决边界。

长度：常规 60–150 中文字；简单可 40–60；成熟复杂可 150–250。

## CREATE
依据 Segment001 + Delta + parent/root context 生成初始 Summary。

## EXTEND
依据 old Summary + new Segment 更新，但不要把作用域无控制扩大。若 summary 已无法准确覆盖 canonical body，输出：
```json
{"needs_full_reanchor":true,"summary":"..."}
```
由工作流决定是否重新读取全文。

## Full Re-anchor
必须重新依据 Canonical Body/分层 segment summaries，不能只总结旧 Summary。

输出 JSON：
```json
{"summary":"...","needs_full_reanchor":false}
```
