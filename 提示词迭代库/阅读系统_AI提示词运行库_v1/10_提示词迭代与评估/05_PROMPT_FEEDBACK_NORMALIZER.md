# Prompt Feedback Normalizer

> Prompt ID：`prompt.feedback`  
> 版本：`runtime-v1.0`  
> 模式：**MAINTENANCE**  
> 日期：**2026-09-07**

将用户类似：
- “刚才不该新建节点”；
- “这个标题太泛”；
- “系统最近太容易 EXTEND”；
- “这里原文解释偏离了作者”

转换成结构化 PromptFeedback：module、turn/object、feedback type、desired behavior、candidate golden fixture。

v1 不根据单条反馈在线自修改 active Prompt。
