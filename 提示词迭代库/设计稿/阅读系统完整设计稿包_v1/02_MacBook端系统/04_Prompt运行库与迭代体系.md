# 提示词运行库与 Prompt Runtime

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 目录
```text
提示词迭代库/
├── modules/
├── profiles/
├── experiments/
├── fixtures/
├── imports/
└── archive/
```

角色建议：responder、graph-curator、document-classifier、boundary-reviewer、block-quality-reviewer、block-title、block-anchor-summary、node-title、node-anchor-summary、interest-feature-extractor、navigation-intent-parser。

## Module Version
```text
modules/graph-curator/v4/
├── module.json
├── system.md
├── task.md
├── output.schema.json
├── examples/
└── tests/
```
正式 Registered Version immutable，内容 hash 固定；修改必须新版本。

## Profile
系统运行一个明确 Profile，不自动选“目录最新”。Profile 锁定 Modules + Context Builder versions + Policy sets + model/runtime policy。激活是原子 pointer switch。

## Freeze
QA 提交时冻结 Profile；ParseJob 启动时冻结。中途激活新版本不改变在途任务。

## Source vs Snapshot
用户编辑 source package。激活时 validate/test/compile/hash，产生 immutable Prompt Snapshot 到系统数据。历史 provenance 引用 Snapshot，而非可变 source 文件。

## Schema / Hard Policy
LLM 输出必须先 schema validation，再 deterministic policy validation，再 commit。坏 Prompt 不能绕过 Block immutable、depth、one action、Focus parent、append-only。

核心原则：**Prompt 决定语义，代码执行不变量。**

## Feedback / Experiment
用户纠正进入 PromptFeedback/Golden Fixture，不在线自动改 Prompt。优先 historical replay、shadow evaluation、regression。v1 不做随机 live A/B 写真实 Graph。

## Prompt Injection
书籍/文件内容是 untrusted SOURCE_DATA。Prompt Runtime 必须区分 system policy、user current request、source material、cognitive record。
