# Golden Cases：Parser

> Prompt ID：`fixture.parser`  
> 版本：`runtime-v1.0`  
> 模式：**TEST**  
> 日期：**2026-09-07**

- 理论文章“有三个原因：”不能在冒号后直接切 Block。
- 小说场景转换是强边界，但单句对白不是默认独立 Block。
- 诗歌按 poem/stanza 保留，不按 token 机械拼接。
- List/quote/table 不因长度轻易拆散。
- Reviewer 只能 KEEP/MERGE/RESPLIT，不能重写原文。
- Block Summary 不能加入读者后来在 Node 中提出的批评。
