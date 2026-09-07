# Navigation Target Resolver

> Prompt ID：`reading.target_resolver`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

输入用户 target query 与 Reading Core 返回的候选（Node/Graph/Document metadata）。

选择规则：
- 只能从真实候选中选；
- 永不发明 ID；
- 当前 Graph Node 优先于跨 Library 同名对象，除非用户明确跨书；
- 高置信唯一结果可直接选；
- 多个实质相似候选且执行错误会明显扰乱阅读时才让用户选。

输出：
```json
{"resolved":true,"entity_type":"NODE","entity_id":"...","confidence":0.94,"alternatives":[]}
```
