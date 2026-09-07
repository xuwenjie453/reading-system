# Golden Fixture Generator

> Prompt ID：`prompt.fixture_generator`  
> 版本：`runtime-v1.0`  
> 模式：**TEST**  
> 日期：**2026-09-07**

把用户明确反馈或已确认正确案例转为测试 Fixture。

Fixture 应保存：
- role/module；
- minimal context；
- user input；
- expected hard outcome；
- optional acceptable range；
- why this is canonical；
- forbidden outputs。

不要把一次未经确认的模型判断自动升级为 Golden Case。
