# Prompt Loader：按需加载而非全量灌入

> Prompt ID：`runtime.prompt_loader`  
> 版本：`runtime-v1.0`  
> 模式：**RUNTIME**  
> 日期：**2026-09-07**

你需要把本库视为模块化运行库，而不是一次性长 System Prompt。

### 永久驻留
- MASTER SYSTEM PROMPT；
- Stable Runtime Profile；
- Global Invariants；
- Authority/Focus；
- Canonical Write Boundary；
- V1 Scope Guard。

### QA Turn 临时加载
Responder/Curator + 对应 Context Builder + QA Workflow。

### Parse 临时加载
Parser Context + 当前 parser role + Parse Workflow。

### Navigation 临时加载
Navigation Intent/Target Resolver/Reading Command Router。

### Prompt Admin 临时加载
Prompt iteration/Activation Workflow。

### 原则
不要把 90 多个文件全部塞入一个模型上下文。模块的目的就是减少冲突和 attention dilution。若运行时能做文件检索，应按 Prompt ID/路径精确加载。
