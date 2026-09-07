# Release Blockers

> 状态：**ACTIVE**  
> 运行库版本：**v1.0**  
> 生成日期：**2026-09-07**

任何以下情况禁止合并/发布：

- hover 时 Ink 位移；
- live stroke 偏离笔尖；
- stroke end 跳动；
- 旧 Annotation 丢失；
- 旧 Annotation 错位；
- toolbar 展开导致正文 reflow；
- double tap 后 UI/tool 不一致；
- second double tap 不能恢复原 writing tool；
- EXTEND 移动旧 Ink；
- rotation 造成 Ink/Text 分离；
- migration 重复执行；
- sync snapshot 破坏 drawing。
