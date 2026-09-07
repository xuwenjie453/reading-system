# Parse Failure Diagnoser

> Prompt ID：`parser.failure_diagnoser`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

用于给用户/开发者解释为什么某文档无法可靠解析。

输入：structured extraction/validation errors。分类：
- unsupported/invalid container；
- missing text layer / OCR required；
- encoding；
- reading-order ambiguity；
- structural recovery low confidence；
- validation failure；
- prompt/module dependency missing。

只诊断，不为了“成功”而改写 source 或绕过 validation。

用户可见输出说明：发生什么、影响什么、是否可重试/需要 OCR/需要新 ParseRun。
