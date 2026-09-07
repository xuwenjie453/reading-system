# Phase Gate 规则

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

## Phase A 完成条件

必须真机通过：
- Existing Ink hover 不移动；
- live stroke 紧贴笔尖；
- 抬笔后不跳；
- page top/middle/bottom 都正确；
- rotation 正确；
- zoom 正确；
- EXTEND 后旧 Ink 不动。

任一失败：
> Phase A 未完成。

## Phase B 完成条件

必须真机通过：
- 圆形按钮状态正确；
- 工具列展开不改变正文 geometry；
- 工具选择即时同步 PKCanvasView.tool；
- double tap ↔ eraser；
- second double tap 恢复原工具全部属性；
- finger scroll 不受影响；
- app restart 恢复 tool preference。

Phase A 未通过，Phase B 禁止开始。
