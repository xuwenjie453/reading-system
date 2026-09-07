# MacBook 端总体架构

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 可见工作区
```text
阅读系统/
├── 资料库/             # 用户自由管理
├── 提示词迭代库/       # 用户自由管理
└── 系统数据/           # 系统控制
```
用户可在资料库自由嵌套、移动、重命名、删除文件；系统依靠永久 ID/fingerprint，而不是路径维持身份。

## ReadingDaemon
第一版建议单长期进程，内部逻辑服务分离：Reading Core、Store Service、Parser、Context Service、Prompt Registry、Scheduler、Interest/Timing、Sync Service、Reading Bridge。

## Codex / zcode
Codex 是自然语言与认知入口，不是数据库。它通过 Reading Core API query context、提交 intent、调用 prompt roles、请求 mutation/navigation/parse。不得直接写 Canonical 文件。

## Mac UI
主要产品界面就是 Codex 对话。只需要轻量 Context Bar/菜单栏显示当前 Document、Graph/Block、Focus、iPad connection。默认不显示 revision/Interest/Curator score。

## 迁移独立性
zcode → Codex 不应改变 Store、Graph model、iPad protocol、Annotation model。运行环境是可替换认知层。
