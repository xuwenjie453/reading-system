# 内容图节点 EXTEND / CREATE 机制设计稿 v2

## 1. 设计目标

每完成一轮新的 QA，系统立即判断这轮认知活动对当前内容图应该产生什么影响。

系统只允许三种结果：

```text
NO_OP
EXTEND
CREATE
```

分别表示：

- `NO_OP`：AI 正常回答，但内容图不发生变化。
- `EXTEND`：将本轮值得长期保存的认知增量，以新的自然段追加到当前内容节点正文末尾；随后更新该节点的 `Anchor Summary`。
- `CREATE`：从当前焦点生长出一个新的内容节点，为新节点生成标题、`Anchor Summary` 和第一段正文，并将焦点切换到新节点。

核心目标不是完整保存聊天历史，而是让内容图最终呈现为：

> 少量、认知边界明确、内容逐渐成熟、拓扑不过度膨胀，同时能够长期回看和继续生长的节点。

本版相较 v1 的关键变化是：

> **标题不再承担主要的认知锚点职责。每个内容节点新增一段可动态更新的 `Anchor Summary`，用于描述节点当前的认知作用域，并成为 EXTEND / CREATE、全图去重和节点复杂度判断的核心依据。**

---

## 2. 内容节点的三层结构

每个 `Content Node` 由三个对用户与系统承担不同职责的内容层组成：

```text
Content Node
├── Title
├── Anchor Summary
└── Body
```

### 2.1 Title：快速识别标签

标题主要服务于 iPad 拓扑图和快速导航。

它应当：

- 简短；
- 易扫描；
- 有辨识度；
- 能指出该节点的大致认知主题；
- 不承担完整描述节点边界的任务。

例如：

```text
先验与天赋知识
自由与道德责任
经验为何没有必然性
```

标题在 `CREATE` 时生成，之后原则上保持稳定。

第一版建议：

- 理想长度：约 6–18 个汉字；
- 软上限：约 24 个汉字；
- 避免大量使用“关于……的理解”“对……的思考”等低信息量标题。

### 2.2 Anchor Summary：认知锚点摘要

`Anchor Summary` 是系统真正用于理解“这个节点到底在讨论什么”的认知锚点。

它不等同于正文摘要，也不是最终答案，而是：

> **对当前节点所承载的认知议题、用户主要疑问、已覆盖的认知范围和当前边界的紧凑描述。**

例如：

```text
本节点围绕用户将“先验”与天赋知识联系起来的疑问展开，
逐步区分了具体知识内容、经验可能条件以及时间意义上的“先天”。
讨论重点在于澄清“先于经验”的认识论含义，并纠正将其直接理解为
天生心理结构的倾向；尚未进入“先验形式为何能够适用于经验对象”的问题。
```

`Anchor Summary` 的主要用途包括：

1. 判断新 QA 是否仍属于当前节点的认知作用域；
2. 判断是否需要 `EXTEND` 或 `CREATE`；
3. 在全图范围内进行语义去重；
4. 判断节点是否开始失去认知纯度；
5. 为后续系统检索、时序复习和内容图分析提供稳定的认知锚点。

### 2.3 Body：认知过程正文

正文记录围绕该节点主题发生的用户思考及系统回应。

它采用 `append-only` 模式：

```text
Paragraph 1
Paragraph 2
Paragraph 3
...
```

新的 `EXTEND` 只在末尾追加新的自然段，不修改、删除或移动已有自然段。

正文记录的是：

- 用户的疑问；
- 用户的理解；
- 用户的反驳；
- 用户提出的例子或推论；
- 系统的回应；
- 系统的纠错和澄清；
- 思考如何继续推进；
- 尚未解决的问题和分歧。

它不是原始 QA 日志，也不是最终结论的静态总结。

---

## 3. Anchor Summary 的更新规则

### 3.1 CREATE 时

创建新节点时，同时生成：

```text
Title
Anchor Summary v1
Body Segment 001
```

其中：

- `Title` 用于快速识别；
- `Anchor Summary v1` 定义节点初始认知作用域；
- `Body Segment 001` 记录产生该节点的第一轮高价值认知过程。

### 3.2 EXTEND 时

`EXTEND` 的执行顺序为：

```text
生成新的正文自然段
↓
append 到 Body
↓
结合完整节点正文重新评估认知作用域
↓
更新 Anchor Summary
↓
Focus 保持不变
```

正文旧内容不变，但 `Anchor Summary` 可以被整体重写。

这形成一个明确分工：

```text
Body = 认知历史
Anchor Summary = 当前认知结构概括
```

### 3.3 标题原则上不随 EXTEND 更新

如果连续 EXTEND 后，原标题已经无法快速识别该节点，第一版仍不建议自动改标题。

系统应优先把这种情况视为一个诊断信号：

> 过去的 EXTEND 是否本来应该在某个时刻转为 CREATE？

标题稳定性有利于 iPad 图谱中的长期空间记忆和节点识别。

---

## 4. 两类焦点具有不同权限

### 4.1 Focus = Content Block

内容块是原始资料，不允许修改。

因此只有：

```text
NO_OP
CREATE
```

绝不存在：

```text
EXTEND ContentBlock
```

内容块正文永久保持不可变。

内容块也可以拥有：

```text
Title
Anchor Summary
Original Text
```

其中 `Anchor Summary` 描述该内容块原文的主要语义、论证动作或叙事中心，但不包含用户后续加工内容。

### 4.2 Focus = Content Node

允许：

```text
NO_OP
EXTEND
CREATE
```

完整的内容图生长决策主要发生在内容节点上。

---

## 5. 焦点不变量

本设计建立在一个硬约束之上：

> **Focus 必须与 iPad 当前所处页面严格双向对应。**

如果 iPad 正在阅读某个 `Content Node A`：

```text
Focus = A
```

如果 iPad 正在阅读中心 `Content Block`：

```text
Focus = ContentBlock
```

如果 iPad 退出具体内容页，进入更上层的内容图拓扑视图：

```text
Focus = ContentBlock
```

因此，图的父子边始终表达：

> **新节点生成时，用户当时真正聚焦在哪个内容对象上。**

双向同步协议另行设计，本稿只将这一关系视为不可违反的系统不变量。

---

## 6. 系统每轮 QA 首先生成 Cognitive Delta

用户看到的是正常的 AI 回答。

回答完成后，系统内部额外形成一个短的结构化判断对象：

```text
Cognitive Delta
```

它回答：

1. 用户这一轮真正提出了什么新的理解、疑问、反驳或推论？
2. 系统这一轮真正增加了什么新的解释？
3. 相比当前节点正文与 Anchor Summary，新增加的认知内容是什么？
4. 这一轮最终解决、深化、修正或打开了什么问题？
5. 这一轮是否使当前节点的认知作用域发生了实质扩张？

例如：

```text
用户进一步质疑：
如果“先验”不是经验所得，也不是天赋知识，
为什么它仍然可以作用于经验？

系统新增解释：
“先验”的关键不是知识产生的时间，
而是它作为经验可能条件的逻辑地位。
```

`Cognitive Delta` 只是内部判断材料，用户不会看到。

---

## 7. 第一层门控：内容质量 Q

所有 EXTEND / CREATE 之前，先计算：

```text
ContentQuality Q ∈ [0,100]
```

这是最重要的变量。

建议由五部分组成：

### 7.1 认知增量 30%

这一轮是否真正产生了此前没有的理解。

### 7.2 用户认知贡献 20%

用户是否提出：

- 有价值的疑问；
- 自己的解释；
- 反驳；
- 推论；
- 重要比较；
- 有意义的反例。

### 7.3 系统解释增量 20%

AI 是否给出了原文、当前节点或此前聊天中尚未充分表达的重要解释。

### 7.4 纠错 / 深化价值 20%

是否纠正重要误解，或者显著深化原有理解。

### 7.5 未来回看价值 10%

假如数月后重新看到这部分内容，是否仍值得阅读。

### 7.6 初版阈值

```text
Q < 45
→ NO_OP
```

```text
45 ≤ Q < 55
→ 默认 NO_OP
```

除非它是当前节点非常必要的一小步补充。

```text
Q ≥ 55
→ 可以考虑 EXTEND
```

```text
Q ≥ 60+
→ 才开始真正考虑 CREATE
```

因此：

> CREATE 的要求高于 EXTEND。

原因是 EXTEND 不增加拓扑复杂度，而 CREATE 会永久给图增加一个圆。

---

## 8. 第二层判断：Anchor Scope Fit

如果 Focus 是内容节点 A，系统计算：

```text
AnchorScopeFit
```

它回答：

> **本轮 Cognitive Delta 是否仍处于 A 当前 Anchor Summary 所定义的认知作用域内？**

这是 v2 中 EXTEND / CREATE 的核心判断之一。

例如，A 的：

```text
Title:
先验与天赋知识

Anchor Summary:
本节点围绕用户将“先验”与天赋知识联系起来的疑问展开，
重点区分具体知识内容、认识论上的先于经验和心理学意义上的先天，
并纠正将先验直接理解为天生心理结构的倾向。
```

以下内容属于高 `AnchorScopeFit`：

- 为什么先验不等于天生知识？
- “先于经验”的“先于”是什么意思？
- 是否应该把先验理解为心理结构？
- 这种区别能否用一个例子说明？

它们都在继续深化同一个认知空间。

因此倾向：

```text
EXTEND
```

但如果新的问题是：

> 先验形式为什么能够适用于外部经验？

虽然仍涉及“先验”，但已经打开一个新的认知问题。

此时 `AnchorScopeFit` 明显下降，开始倾向：

```text
CREATE
```

---

## 9. 判断 EXTEND 的核心标准

EXTEND 应同时满足以下条件中的大多数，并且不能出现强烈的 CREATE 信号。

### 条件 A：认知主题连续

新内容仍然服务于当前节点已经形成的核心认知议题。

### 条件 B：Anchor Summary 可以自然吸收新内容

系统问：

> 如果把本轮 Cognitive Delta 纳入当前节点，是否只需要对 Anchor Summary 做自然扩展，而无需把它改写成一个明显更宽泛、包含多个独立主题的描述？

如果答案是“可以自然吸收”，支持 EXTEND。

### 条件 C：新内容不是独立的未来阅读对象

系统问：

> 用户未来是否有明显理由把这一轮内容作为一个独立圆重新进入？

如果答案是“没有，它主要是在把当前问题想得更清楚”，支持 EXTEND。

### 条件 D：没有造成明显主题分裂

如果追加以后，为了概括节点不得不让 Anchor Summary 同时罗列：

```text
定义
+
批判
+
与另一作者比较
+
现实应用
```

则说明当前节点开始失去认知纯度。

此时应该停止 EXTEND，并考虑 CREATE。

### 条件 E：新的自然段仍能作为当前认知过程的连续下一步

如果新增段落可以自然以如下形式承接：

- “用户随后进一步追问……”
- “在此基础上，用户又注意到……”
- “这一澄清之后，用户进一步……”

且不需要另起一个全新的主题说明，则支持 EXTEND。

---

## 10. EXTEND 的具体执行方式

一旦决定：

```text
EXTEND A
```

系统必须遵守：

### 10.1 旧正文不可修改

只能：

```text
append
```

例如：

```text
Node A

旧自然段 1
旧自然段 2
旧自然段 3

↓ EXTEND

新增自然段 4
```

### 10.2 新增内容不是原样 QA

系统应将本轮认知过程重新叙述成自然文章，例如：

> 用户随后进一步质疑，如果先验形式并不是从经验获得，是否仍然应该把它理解为一种与生俱来的心理结构。系统对此进一步区分了认识论上的条件与经验心理学上的事实：康德要处理的核心并不是这些结构在人类发展中的出现时间，而是它们对于经验知识成立所具有的逻辑优先性。

而不是：

```text
用户：……
AI：……
```

### 10.3 EXTEND 后更新 Anchor Summary

正文追加完成后，系统根据：

```text
旧 Anchor Summary
+
完整 Body
+
本轮 Cognitive Delta
```

重新生成新的 Anchor Summary。

### 10.4 EXTEND 不改变 Focus

```text
Focus = A
```

保持不变。

### 10.5 EXTEND 不修改标题

标题原则上保持稳定。

---

## 11. 第三层判断：是否形成新的独立认知分支

如果不适合 EXTEND，则计算：

```text
BranchIndependence
```

主要看四件事。

### 11.1 是否出现新的核心问题

例如：

```text
X 是什么？
```

转向：

```text
接受 X 以后会导致什么？
```

属于明显转向。

### 11.2 是否出现新的认知动作

例如：

```text
理解作者
→ 批评作者
```

或者：

```text
解释概念
→ 与另一理论比较
```

或者：

```text
理解原文
→ 推导新的结论
```

这些都会提高 CREATE 倾向。

### 11.3 是否能够自然生成自己的 Anchor Summary

如果新内容很容易被描述成一个与当前节点不同、可独立成立的认知空间，则是强 CREATE 信号。

例如：

```text
Candidate Anchor Summary:
本节点将前面对自由概念的理解进一步推进到道德责任问题，
重点讨论如果行动必须归因于主体自身，为什么这种归因会被视为责任成立的条件。
```

它显然已经可以独立存在。

### 11.4 是否具有独立回访价值

数月以后单独点开它是否仍然成立？

如果成立，支持 CREATE。

---

## 12. CREATE 门槛随着图深度提高

中心内容块：

```text
depth = 0
```

其子节点：

```text
depth = 1
```

继续递归。

第一版建议：

| 新节点深度 | 最低 ContentQuality |
|---:|---:|
| 1 | 60 |
| 2 | 68 |
| 3 | 76 |
| 4 | 85 |
| 5 | 94 |
| >5 | 禁止 CREATE |

因此：

> 内容质量是主要因素，深度是抑制因素。

一个 depth 4 的极高价值问题仍然可以生成节点，但普通问题不会让图无限向外延伸。

---

## 13. 深度只限制 CREATE，不限制 EXTEND

假设：

```text
Block
  │
  A
  │
  B
  │
  C
  │
  D
```

D 已经很深。

用户仍可以继续围绕 D 深入：

```text
EXTEND D
```

完全允许。

因此深度机制不会打断思考，只控制图的拓扑半径。

---

## 14. 第四层门控：基于 Anchor Summary 的全图语义去重

CREATE 之前必须检查：

```text
Candidate Anchor Summary
VS
当前 ContentGraph 中所有 Existing Anchor Summaries
```

不是只检查兄弟节点，而是检查整张内容图。

### 14.1 第一阶段：摘要级快速比较

使用 Anchor Summary 做语义检索，找到最相似的少数已有节点。

### 14.2 第二阶段：认知覆盖判断

对最相似节点进一步判断：

```text
CognitiveCoverage
```

即：

> 图中是否已经有一个节点，基本完整承载了候选节点准备表达的认知内容？

### 14.3 三种结果

#### 情况 1：主题相似，但认知内容不同

允许 CREATE。

例如：

```text
Node A
自由不是任意行动

Node B
自由为何是道德责任的条件
```

#### 情况 2：高度相似，而且已有节点基本全部覆盖

抑制 CREATE：

```text
CREATE → NO_OP
```

AI 的即时回答仍正常存在，但不污染内容图。

#### 情况 3：高度相似，但有重大新认知增量

允许 CREATE，但要求更高质量，并再次确认它是否真的形成独立认知作用域。

原则是：

> 相似不是禁止深化，而只是禁止重复。

---

## 15. 第一版禁止自动修改远处相似节点

假设：

```text
Focus = Node A
```

候选内容高度类似另一处：

```text
Node F
```

第一版系统绝对不能：

```text
自动跳到 F
自动 EXTEND F
自动修改 F
自动把 A 与 F 连起来
```

原因是：

> 图结构必须忠实于用户当时的焦点。

因此全图相似检查在 v1/v2 中只具有：

```text
CREATE 抑制权
```

没有自动重构权。

---

## 16. 第五层因素：Node Complexity

即使新内容仍然和当前节点相关，一个节点也不能无限吸收一切。

系统维护：

```text
NodeComplexity ∈ [0,100]
```

但 v2 不只从正文长度判断，而重点利用 Anchor Summary 的结构变化。

### 16.1 文字体量

正文已经非常长，会提高复杂度。

### 16.2 子议题数量

Anchor Summary 是否开始不得不列出多个相对独立的问题？

### 16.3 认知转折数量

例如节点已经经历：

```text
疑问
→ 澄清
→ 反驳
→ 再修正
→ 推论
→ 比较
```

会提高复杂度。

### 16.4 Anchor Scope Complexity

这是 v2 新增的重点指标。

系统检查：

> 当前 Anchor Summary 是否仍能够用一个统一的认知主题自然概括整个节点？

如果摘要开始变成：

```text
本节点讨论自由的定义，同时涉及道德责任、法律责任、
与休谟的比较以及现代神经科学对自由意志的挑战……
```

说明认知纯度已经明显下降。

这将提高未来 CREATE 的倾向。

---

## 17. Complexity 不会强制分割已有节点

系统不会回头：

> “A 太大了，我把 A 拆成 A1、A2。”

第一版禁止自动重构已有图。

Complexity 只影响未来决策：

```text
Complexity 越高
→ EXTEND 门槛略升
→ CREATE 倾向略升
```

因此节点会自然停止吸收越来越边缘的认知内容。

---

## 18. 认知纯度优先于长度

例如节点有 2500 字，但其 Anchor Summary 始终能够清楚描述为：

> 一个非常困难但统一的自由意志问题。

仍然可以 EXTEND。

相反，一个节点只有 700 字，但其 Anchor Summary 已经不得不同时覆盖：

- 自由定义；
- 对作者的反驳；
- 与休谟比较；
- 对法律责任的现实应用。

则应该尽早 CREATE。

因此：

> 大节点不一定坏；认知作用域失焦的节点才坏。

---

## 19. 一个 QA 最多执行一次结构动作

第一版采用硬限制：

> **每完成一轮 QA，最多产生一个内容图结构动作。**

不能：

```text
一轮 QA
→ 同时创建 B、C、D 三个节点
```

因此即使用户一次提出多个高质量问题，系统也必须确定本轮的主认知方向。

最终最多：

```text
CREATE 一个节点
```

或者：

```text
EXTEND 当前节点
```

其余内容仍可以正常出现在 AI 回答中，但不一定进入内容图。

---

## 20. CREATE 与 EXTEND 同时都合理时怎么办

例如当前 Node A：

```text
作者对自由的定义
```

用户这一轮既进一步澄清了定义，又提出：

> 那这种自由与道德责任有什么关系？

前半部分适合 EXTEND，后半部分适合 CREATE。

第一版规则：

> **优先执行认知上更重要的那个结构动作。**

如果新的独立分支：

- ContentQuality 高；
- BranchIndependence 高；
- Candidate Anchor Summary 明显能够独立成立；

则：

```text
CREATE
```

而不再同时 EXTEND A。

新节点第一段正文可以用必要的一两句交代它如何从 A 的理解中产生。

如果独立分支只是顺带一提，而真正有价值的是对 A 的深化：

```text
EXTEND A
```

因此一次 QA 永远只有一个“主认知产物”。

---

## 21. 模糊情况下系统必须偏保守

如果 AI 无法明确判断：

```text
EXTEND or CREATE？
```

优先：

```text
EXTEND > CREATE
```

如果：

```text
NO_OP or EXTEND？
```

且内容质量处于边界：

```text
NO_OP > EXTEND
```

整体哲学：

```text
不要轻易记录
↓
记录时不要轻易增加节点
↓
只有真正出现独立高价值认知方向时才 CREATE
```

---

## 22. CREATE 后的行为

一旦 CREATE：

```text
A
│
B
```

系统立即：

1. 生成 B 的永久 `node_id`；
2. 根据本轮 QA 写出 B 的第一段正文；
3. 生成 B 的 `Title`；
4. 生成 B 的 `Anchor Summary`；
5. 建立：

   ```text
   parent = A
   ```

6. 设置：

   ```text
   Focus = B
   ```

7. iPad 阅读器自动进入 B 的正文页面。

之后新的 QA 以 B 为焦点。

---

## 23. EXTEND 后的行为

EXTEND：

```text
A → A + 新段落
```

系统：

- 不改标题；
- 不改旧正文；
- 不改边；
- 不改变节点位置；
- Focus 仍然等于 A；
- iPad 仍然处于 A 页面；
- 在正文末尾追加新的自然段；
- 根据完整节点内容更新 `Anchor Summary`。

因此 EXTEND 的唯一可演化元数据是：

```text
Anchor Summary
```

而正文历史保持稳定。

---

## 24. NO_OP 后的行为

NO_OP：

```text
Graph 完全不变
```

- Focus 不变；
- iPad 页面不变；
- AI 回答仍正常存在于 Mac 当前对话；
- 不修改 Anchor Summary；
- 不修改正文。

因此：

> 对话层远比内容图丰富。

这是有意设计，而不是信息遗漏。

内容图只负责长期沉淀。

---

## 25. 内容块焦点的特殊决策

当：

```text
Focus = ContentBlock
```

流程：

```text
QA
↓
提取 Cognitive Delta
↓
内容质量判断
↓
是否形成值得独立存在的认知议题？
↓
生成 Candidate Anchor Summary
↓
全图摘要去重
↓
depth=1 门槛
↓
CREATE / NO_OP
```

因为不能 EXTEND 原文。

这会使内容块天然成为所有一级思想分支的出发点。

---

## 26. 标题与 Anchor Summary 的职责分离

v2 正式取消 v1 中“标题 = Semantic Scope Anchor”的设定。

现在：

```text
Title
→ 面向用户的快速识别标签

Anchor Summary
→ 面向系统的认知作用域锚点
```

因此 EXTEND / CREATE 不再主要依赖标题，而主要依赖：

```text
Anchor Summary
+
Cognitive Delta
+
Body Context
```

标题只提供辅助语义信号。

---

## 27. Anchor Summary 的建议长度与写作规范

第一版建议：

- 常态长度：约 60–150 个汉字；
- 简单节点可更短；
- 成熟复杂节点可达到约 150–250 字；
- 不建议使用项目符号；
- 保持为一段紧凑自然语言；
- 不写成“最终答案”；
- 不机械复述正文。

一个好的 Anchor Summary 应回答三件事：

1. 这个节点的核心认知对象是什么？
2. 用户主要在解决什么疑问、形成什么理解或进行什么争论？
3. 当前节点已经覆盖到哪里，哪些邻近问题尚未进入本节点？

第三项尤其重要，因为它直接定义认知边界。

---

## 28. 系统应该保留每次决策理由

系统自管目录中记录：

```text
decision = EXTEND

content_quality = 78
anchor_scope_fit = 0.91
branch_independence = 0.34
graph_duplicate = 0.18
depth = 2
node_complexity = 43
anchor_scope_complexity = 0.22
```

或者：

```text
decision = CREATE

content_quality = 86
anchor_scope_fit = 0.47
branch_independence = 0.88
graph_duplicate = 0.21
new_depth = 3
node_complexity = 61
anchor_scope_complexity = 0.67
```

同时保存：

```text
old_anchor_summary
new_anchor_summary   # EXTEND 时
candidate_anchor_summary   # CREATE 候选时
```

用户完全不需要看到。

但这对于提示词迭代和调试非常重要。

---

## 29. Responder 与 Graph Curator 分工

逻辑上仍然拆成：

```text
Responder
+
Graph Curator
```

### 29.1 Responder

职责：

> 把用户这一轮问题回答好。

它不应该因为“可能不生成节点”而降低回答质量。

### 29.2 Graph Curator

回答结束后读取：

```text
当前 Focus
当前节点 Title
当前节点 Anchor Summary
当前节点必要正文上下文
本轮 Q/A
Cognitive Delta
整张内容图所有 Anchor Summaries
当前节点 depth / complexity
```

决定：

```text
NO_OP
EXTEND
CREATE
```

并在需要时输出：

- 新增正文自然段；
- 新节点标题；
- 新节点 Anchor Summary；
- 更新后的 Anchor Summary；
- 决策评分与理由。

两者技术上可以由同一个模型调用完成，也可以未来拆成不同调用，但提示词职责必须逻辑分离。

---

## 30. v2 最终决策树

```text
                    新 QA 完成
                        │
                        ↓
               提取 Cognitive Delta
                        │
                        ↓
                  ContentQuality
                        │
              ┌─────────┴─────────┐
              │ Q 太低             │ Q 足够
              ↓                   ↓
            NO_OP            Focus 类型？
                                │
                   ┌────────────┴────────────┐
                   ↓                         ↓
              ContentBlock              ContentNode
                   │                         │
                   ↓                         ↓
          是否形成独立认知议题？      AnchorScopeFit 是否高？
              │        │                 │        │
              否       是               是       否
              ↓        ↓                 ↓        ↓
            NO_OP   生成 Candidate     Complexity   是否形成
                    Anchor Summary       判断      独立认知分支？
                        │                 │         │
                        ↓                 ↓         ↓
                   全图摘要去重        EXTEND   生成 Candidate
                        │                           Anchor Summary
                        ↓                               │
                     深度门控                          ↓
                        │                         全图摘要去重
                        ↓                               │
                     CREATE                              ↓
                                                   深度门控
                                                       │
                                                       ↓
                                                    CREATE
```

所有不确定情况向更保守方向退让：

```text
CREATE → EXTEND → NO_OP
```

---

## 31. 这套机制最终塑造的图

系统不会形成：

```text
每问一句就一个节点
```

而更可能形成：

```text
                        ○ 独立推论
                       /
             ○───────○
            /          \
           /            ○ 反驳方向
          ●
           \
            ○ 概念澄清
             \
              ○ 更深层问题
```

同时，每个圆内部又可能积累多轮紧密相关的：

```text
用户思考
+
系统回应
+
进一步追问
+
进一步修正
```

而每个圆都有一个持续演化的：

```text
Anchor Summary
```

用于描述：

> 这个认知方向目前已经发展成了什么。

因此：

> **图负责表达“思考方向发生了什么分叉”；正文负责表达“一个方向内部怎样逐渐深入”；Anchor Summary 负责表达“这个方向当前整体上究竟是什么”。**

---

## 32. 第一版最终规则

1. 每轮 QA 完成后立即做一次结构决策。
2. 内容质量是所有结构变化的首要门槛。
3. 每个节点由 `Title + Anchor Summary + Body` 三层组成。
4. Title 负责用户快速识别，不再承担主要认知锚点职责。
5. Anchor Summary 是 EXTEND / CREATE、全图去重和认知纯度判断的核心依据。
6. 同一认知作用域继续深入，优先 EXTEND。
7. EXTEND 只追加正文，并在追加后更新 Anchor Summary；不修改旧正文和标题。
8. 出现值得独立回访的新认知方向时，才考虑 CREATE。
9. CREATE 必须生成新的 Title、Anchor Summary 和第一段正文。
10. CREATE 必须接受全图摘要级去重与节点深度限制。
11. CREATE 后焦点自动迁移至新节点；EXTEND 与 NO_OP 不改变焦点。
12. Focus 与 iPad 当前页面严格双向对应；进入内容图上层视图时 Focus 回到内容块。
13. 已存在的图拓扑原则上不自动重写、不自动合并、不跨焦点修改远处节点。
14. 模糊情况下系统始终偏向更少、更稳定的图结构。

---

## 33. v2 的核心抽象

整个机制最终可以压缩为：

```text
每轮 QA
   ↓
Cognitive Delta
   ↓
Content Quality
   ↓
Anchor Scope 判断
   ↓
┌───────────────┬────────────────┬────────────────┐
│               │                │
NO_OP         EXTEND           CREATE
│               │                │
不记录      追加正文段落      新建认知分支
                │                │
         更新 Anchor Summary   生成 Title
                               Anchor Summary
                               Body Segment 001
                                │
                                ↓
                           Focus → 新节点
```

这套设计的目标不是把所有对话结构化，而是：

> **把真正值得长期保存的认知活动，压缩成少量稳定节点；让节点内部通过正文不断积累，让节点边界通过 Anchor Summary 保持清晰，让拓扑只在真正出现新的认知方向时才生长。**
