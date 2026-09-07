# Mac 对话界面与命令体验

> 状态：**CANONICAL**  
> 设计基线：**v1.0-canonical**  
> 整理日期：**2026-09-07**

## 主界面
Mac 主要界面就是 Codex/zcode 对话，不做重型阅读 Dashboard。轻量 Context Bar：Document、Block/Graph、Focus、iPad connection。

## 自然语言优先
支持“下一块 / 上一块 / 结束 / 回到图谱 / 打开某节点 / 从这里继续 / 解析资料库 / 今天只读这本书 / 给我一个以前感兴趣的内容”。Slash commands 只是快捷方式，进入同一 Intent Layer。

## Curator 可见性
NO_OP 隐藏；EXTEND 基本隐藏；CREATE 可轻量提示“形成新节点：…”。Debug 模式才展示 Q/ScopeFit/Duplicate 等。

## Commit 语义
只有 Core COMMITTED / iPad VIEW_COMMITTED 后才说“已完成/已打开”。不能乐观假成功。

## Offline
显示 iPad 离线、Focus 未确认；Mac 可对明确 target 回答。只有真正需要自动 Focus 时说明限制。

## 菜单栏
极简：daemon state、iPad state、current document、parse task、status、parse、quit。不编辑 Graph/Prompt/Interest。

## 不复制 iPad
v1 Mac 不显示完整 Graph 和正文阅读器，发挥键盘/长文本/Codex/文件系统优势。
