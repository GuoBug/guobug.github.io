---
layout: post
title: "构建高效 AI Agent 的上下文工程：从 Prompt 到 Context 的范式演进（Anthropic 官方工程实践精译）"
title_en: "Effective Context Engineering for AI Agents (Anthropic Engineering Translation)"
date: 2026-09-29 18:30:00 +0800
categories: [AI, Architecture, Engineering]
pub_tag: "Context Engineering"
math: true
summary: "在应用 AI 领域，工程重心正从打磨提示词转向设计最优上下文配置。本文精译 Anthropic 最新官方工程指南，剖析多轮自主 Agent 面临的 Transformer O(n²) 注意力预算瓶颈与上下文退化（Context Rot）。结合 Claude Code 与复杂 Agent 实战经验，系统解构即时按需检索（Just-in-Time）、渐进式探索、上下文压实（Compaction）、结构化外部记忆与子智能体隔离等全套架构方案。"
summary_en: "AI engineering is transitioning from prompt crafting to context engineering: finding the minimal set of high-signal tokens to guide agentic behavior. This article presents a complete technical translation of Anthropic's official engineering guide, exploring transformer attention budget constraints, context rot, and JIT progressive disclosure. It details production strategies from Claude Code—such as history compaction, structured note-taking, and sub-agent architectures—for long-horizon task execution."
read_time: "15 MIN READ"
tags: [Context Engineering, AI Workflow Orchestration, DAG State Machine, Transformer Attention Budget, Context Rot, Compaction, Multi-Agent Architecture, Claude Code, Product Engineer]
---

> 原文作者：Anthropic Applied AI 团队（Prithvi Rajasekaran, Ethan Dixon, Carly Ryan, Jeremy Hadfield 等）  
> 英文原文：[Effective context engineering for AI agents (Anthropic Engineering)](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)  
> 译者按：在设计 **AI 工作流编排**（AI Workflow Orchestration）、**确定性工作流** 与 **DAG 状态机** 系统的过程中，我们发现很多工程卡点往往与模型参数规模无关，而与上下文的治理策略直接相关。Anthropic 这篇工程长文清晰地厘清了从“提示词工程”走向“上下文工程”的底层必然性。经校对与工程对照，将全文精译于此，供同行参考。

> 上下文工程定义：**上下文工程**（Context Engineering）是指在语言模型推理过程中，针对其底层物理与计算约束，精选并维护最优 Token（信息）状态的工程实践。其本质是寻找触发期望行为的**最小有效高信噪比 Token 集合**。

---

![构建高效 AI Agent 的上下文工程]({{ '/assets/images/anthropic-context-engineering-og.png' | relative_url }})

过去几年，提示词工程一直是应用 AI 领域的核心关注点。但最近，一个新的工程概念走到了聚光灯下：上下文工程。

在使用语言模型开发系统时，工程师的工作重点正在悄然改变：核心不再是单纯为提示词寻找字句修辞，而是回答一个宏观的系统工程问题：“究竟什么样的上下文配置，最有可能引导模型产生我们期望的执行行为？”

所谓上下文（Context），指的是在对大语言模型（LLM）进行单次采样时所传入的全部 Token 集合。而这里的工程课题，便是在 LLM 固有系统边界与物理约束下，优化这些 Token 的效用，以稳定达成目标行为。

驯服大模型的关键往往在于“在上下文中思考”——全面审视模型在任意特定时刻所能触达的完整系统状态，并预判该状态在多轮交互中可能引发的动作分支。

---

## 一、 上下文工程 vs. 提示词工程

在 Anthropic 的研发视野中，上下文工程是提示词工程的自然演进。

提示词工程侧重于如何编写和编排给模型的指令文本，以获得最优结果。而上下文工程则是指一套在推理期间精选、组织和维护最优 Token（信息）集合的综合策略，这涵盖了提示词之外的所有动态信息。

![提示词工程 vs. 上下文工程]({{ '/assets/images/anthropic-prompt-vs-context-engineering.png' | relative_url }})

*在单次提示词工程（左）中，上下文是离散静态的；而在面向智能体的上下文工程（右）中，环境信息与工具调用结果在多轮循环中持续涌入，系统必须在每轮推理决策前进行动态提纯与精简。*

早期使用大模型开发时，写提示词是 AI 工程中最耗时的部分。日常对话之外的绝大多数场景，主要依赖针对单轮分类或单次文本生成任务的静态提示词。

随着工程目标转向构建能在多轮推理与更长时间跨度下自主运行的复杂 Agent，开发者必须建立全局上下文的管理能力。系统指令、工具契约、模型上下文协议（MCP）、外部检索数据以及多轮历史消息，共同构成了运行态的全部输入。

在一个循环执行的 Agent 中，每一轮交互都在产生新的潜在关联数据。从持续膨胀的信息池中精确裁切输入内容，便构成了上下文工程的艺术与科学。

---

## 二、 为什么上下文工程对高能力智能体至关重要

尽管现代大模型速度越来越快、能处理的数据量越来越大，但我们发现它与人类认知类似：当信息量超过一定阈值，模型同样会出现注意力涣散或逻辑混乱。

关于“大海捞针”（Needle-in-a-haystack）基准测试的研究揭示了**上下文退化**（Context Rot）的物理现象：当上下文窗口中的 Token 数量增加时，模型从中精准召回与定位信息的能力会出现衰退。

虽然不同模型表现出的衰退斜率有所差异，但这种现象在所有前沿架构中普遍存在。上下文是一项边际收益递减的有限资源。正如人类受限于有限的工作记忆容量，LLM 在解析庞大上下文时同样消耗着有限的**注意力预算**（Attention Budget）。新注入的每个 Token 都会在某种程度上消耗这一预算，因而对输入给模型的 Token 进行审慎剪裁显得尤为关键。

![注意力预算与高信噪比 Token 提纯]({{ '/assets/images/context-engineering-attention-budget.jpg' | relative_url }})

注意力稀缺源于 LLM 底层的 Transformer 架构。在该架构下，上下文内的每个 Token 都会与其他所有 Token 建立注意力关联。对于 $n$ 个 Token，系统需要维护 $O(n^2)$ 的两两成对关系。

随着上下文长度增加，模型捕获所有全局成对关系的能力会被稀释，从而在上下文规模与注意力集中度之间产生内在张力。

模型的注意力模式主要来自训练数据分布，而在通用训练集里，短序列的样本分布远多于极端长序列。这意味着模型在全局跨段长程依赖上积累的参数权重与经验相对较少。

像位置编码插值（Position Encoding Interpolation）这类技术虽然能让模型适应原本训练窗口之外的长文本，但也会伴随对 Token 相对位置理解精度的损耗。这些因素共同作用，导致模型的长程表现呈现渐进式衰退，而非断崖式崩溃。

在长上下文环境下，模型依然具备强大的理解力，但相较于短上下文场景，信息检索与长程复杂推理的精度会发生边缘损耗。因此，合理的上下文工程是保证 Agent 稳定运行的前提。

---

## 三、 有效上下文的解剖学结构

在有限注意力预算的前提下，优秀的上下文工程意味着去寻找能够最大化目标行为达成概率的最小高信噪比 Token 集合。在工程落地上，这涉及对不同上下文组件的具体拆解：

### 1. 系统提示词（System Prompts）

系统提示词应当极尽清晰，使用简明直接的语言，并保持在适配 Agent 的“合适高度”（Right Altitude）。所谓合适高度，是介于两种常见工程误区之间的平衡点：

- 一种极端是硬编码复杂且脆弱的 if-else 逻辑试图锁死每一步，这会带来系统的极高脆性与维护成本；
- 另一种极端是仅给出空泛的高阶建议，默认模型与开发者享有心照不宣的先验背景。

合适的高度既具体到足以明确引导动作走向，又灵活到为模型留出充足的启发式判断空间。

![校准系统提示词的合适高度]({{ '/assets/images/anthropic-calibrating-system-prompt.png' | relative_url }})

*在提示词光谱的两端，一端是脆弱写死的 if-else 规则，另一端是过于空泛或默认共享先验知识的指令。优秀的设计应处于兼顾指导性与灵活性的适中高度（Just right）。*

在组织结构上，推荐使用明确的分区标记（例如 `<background_information>`、`<instructions>`、`## 工具指南`、`## 输出契约` 等），并借助 XML 标签或 Markdown 标题进行物理隔离。

系统提示词的设计目标是精简完整。精简不等于盲目缩写字数，仍需提供充足的先验信息确保 Agent 遵守规则。最佳实践是先用顶级模型配合极简 Prompt 进行冒烟测试，摸清边界缺陷，再针对性补充指令与少量样本进行打补丁修剪。

### 2. 工具契约（Tools）

工具定义了 Agent 与运行环境及其动作空间之间的交互契约。工具设计必须保障效率——既要让工具返回的数据在 Token 层面足够经济，又要引导 Agent 形成高效的操作模式。

工具应该具备良好的独立封装性、高容错能力以及边界明确的功能定义。参数命名应当自解释且语义无歧义，充分顺应模型的语言理解习惯。

工程实践中最常见的反模式是设计出功能重叠、职责混杂的庞大工具集。如果人类工程师在特定场景下都无法果断判断该调哪个工具，就无法指望 AI Agent 做出精准决策。精炼的核心工具集能够显著降低长程交互下的上下文污染。

### 3. 示例（Few-Shot Examples）

提供少样本示例是业界广泛验证的标准实践。

不少团队倾向于在提示词里塞入又长又杂的边界特例清单，试图穷举模型可能遇到的所有异常。我们并不推荐这种打法。更高效的工程方案是精心挑选少量具有代表性、高信噪比的正交规范示例（Canonical Examples）。对于语言模型而言，几个典型示例胜过上千字的规则堆砌。

---

## 四、 上下文检索与智能体自主搜索

智能体的基础模式可以概括为大模型在多轮循环中自主调用工具。

伴随底层模型推理能力的增强，Agent 的自主空间也在稳步扩展，更智能的模型使系统能够在复杂问题空间中自主导航并从异常中自行恢复。

这种演进正在改变上下文的设计方式。以往的应用系统大多采用基于 Embedding 的前置检索方案，将召回的相关切片在推理前全量塞入 Prompt。而在面向 Agent 的实践中，越来越多的团队正在转向“即时动态检索”（Just-In-Time Context）。

Agent 无需预先载入全量数据，只需维护一组轻量级句柄（文件路径、数据库查询语句、外部链接等），并在运行期间根据需要动态调用工具加载数据。

Anthropic 的终端编程 Agent 产品 Claude Code 便采用了这一思路：面对大规模数据库或代码仓库，模型自主构造定向查询，利用 Bash 环境下的 `head`、`tail`、`grep` 等基础命令进行分段审查，无需一次性将庞大源码或全量数据强行灌入上下文。这与人类工作记忆相符：面对复杂工程，人类通常利用文件树、索引表与书签按需检索，而非机械背诵全量代码。

动态检索还带来了渐进式探索能力。通过多轮交互，Agent 能够从文件尺寸、命名习惯、时间戳等元数据中捕捉信号，层层剥离并逐步聚焦关键信息，在工作记忆中只沉淀高价值切片。

这一模式存在物理权衡：运行时的自主探索需要发起多次工具往返调用，其耗时显然高于直接读取静态预计算数据；同时对工具质量提出了更苛刻的工程要求。如果缺乏合理的先验指引，Agent 容易陷入搜索死胡同或误用工具。

在实际生产场景中，混合架构往往更加均衡。例如在 Claude Code 中，`CLAUDE.md` 规范会在初始阶段预先加载进上下文以确立基线契约，而具体文件的检索则完全依靠运行时的按需工具探索。

---

## 五、 长周期任务的上下文工程

长周期任务要求 Agent 在跨越数十分钟甚至数小时的持续操作序列中，始终保持目标导向与上下文连贯，其总 Token 吞吐量往往远超单一上下文窗口上限。

等待物理上下文窗口的无限扩大并不现实。在可预见的未来，无论窗口如何扩容，上下文污染与注意力退化在长程复杂推理中依然是工程瓶颈。为了支持 Agent 在长时序下稳定工作，Anthropic 沉淀了**长周期任务三级防御**体系：

![Anthropic 上下文工程架构与长周期防御体系]({{ '/assets/images/flowchart-context-engineering-architecture.svg' | relative_url }})

### 1. 上下文压实（Compaction）

压实是指当多轮会话接近上下文窗口边界时，让模型对历史轨迹进行高质量无损浓缩，并使用压缩后的摘要初始化全新上下文窗口的工程手段。

在 Claude Code 的实现中，系统会把历史消息传递给模型进行信息提纯：重点保留关键架构决策、尚未修复的 Bug 边界与具体实现细节，剔除冗余的工具输出与重复问答。Agent 随后带着浓缩后的摘要以及最近访问的 5 个关键文件开启新窗口，实现平滑续跑。

压实的工程核心在于取舍权衡。过于激进的粗暴截断可能导致关键的细枝末节在后续推理中丢失。实现压实系统时，建议先通过复杂 Agent 调试日志校准浓缩提示词：初期优先保证召回率，捕获所有关键信息，随后逐步剔除无价值内容以提升精度。

最立竿见影且安全的低成本压实手段是清理历史工具结果（Tool Result Clearing）。当某个工具结果在较早轮次已被解析并采纳，后续推理无需反复保留其冗长的原始 Payload。

### 2. 结构化外部记忆（Structured Note-Taking）

结构化笔记，即 Agent 显式外部记忆，是指 Agent 在执行任务时定期将阶段性结论与笔记持久化写入上下文窗口之外的存储介质，并在需要时重新调入上下文。

这种模式开销低且可靠。例如让 Agent 维护外部 `NOTES.md` 或 Todo 任务清单，能够让它在穿过多轮复杂工具调用后，仍然牢牢锁住全局任务主线与跨节点依赖关系。

在 Claude 玩宝可梦（Claude playing Pokémon）的实验中，这种显式记忆展现了对长程任务的支撑能力：Agent 在数千步游戏操作中维护精确的计数与笔记（如“在 1 号道路已训练 1234 步，皮卡丘已升至 8 级，距 10 级还差 2 级”）。它不仅自主构建了已探索地图，还能沉淀战术笔记指导后续克制战斗。每当上下文重置后，Agent 主动读取自己的外部笔记，继续投入长达数小时的连续任务。

在 Claude 平台中，官方推出了基于文件系统的 Memory 工具公测，正是通过这套模式帮助 Agent 跨会话沉淀经验与项目状态。

### 3. 子智能体架构（Sub-Agent Architectures）

当系统复杂度进一步攀升，子智能体架构为规避上下文膨胀提供了另一种解耦方案。

与其让单个主 Agent 在膨胀的上下文里包揽所有脏活，不如将专职任务分发给拥有纯净上下文窗口的子智能体。主智能体负责维护高阶规划与拓扑调度，子智能体利用专用工具深入代码或数据细节进行高强度探索。子智能体可能会消耗上万甚至数十万 Token 进行试错挖掘，但最终回传给主控 Agent 的，仅是一份 1,000~2,000 Token 的浓缩结论。

这种设计实现了关注点分离：嘈杂的排查上下文被有效隔绝在子智能体内部，主智能体得以专注于全局推演与综合裁决。

![结构化记忆核心与子智能体认知隔离]({{ '/assets/images/context-engineering-subagent-memory.jpg' | relative_url }})

### 4. 方案选型权衡

这三种技术并不相互排斥，其选型完全取决于具体业务特征：

| 上下文治理策略 | 核心运作机制 | 核心收益与物理优势 | 典型工程代价与瓶颈 | 推荐适配场景 |
| :--- | :--- | :--- | :--- | :--- |
| 上下文压实 (Compaction) | 周期性历史总结，重置全新上下文窗口 | 保持长线会话流畅流转，开发改造成本最低 | 存在关键信息截断风险，依赖精细 Prompt 调优 | 深层往复的多轮对话与代码审查 |
| 结构化外部记忆 (Note-taking) | 显式写入外部文件或状态存储，按需召回 | 上下文重置后状态零丢失，任务进度与主线确定性极高 | 增加读写工具往返，需要设计清晰的信息持久化格式 | 具备明确交付里程碑的迭代式研发 |
| 子智能体架构 (Sub-Agents) | 干净窗口分治并行，仅回传高密度摘要 | 上下文物理强隔离，有效防范杂乱原始数据污染主脑 | 增加系统复杂度与多 Agent 协议编排成本 | 跨模块代码重构、大规模调研与深度推演 |

在模型推理与泛化能力不断提高的今天，维护长周期交互下的上下文一致性与信噪比，仍然是打造可靠 Agent 的生命线。

---

## 六、 结语

上下文工程标志着大模型系统构建范式的根本性转变。

随着模型能力日趋强大，工程的胜负手已经不仅限于打磨单句提示词，而在于每一个时序步骤中，系统能否以极度自律的姿态分配模型有限的注意力预算。

无论是为长周期任务实施上下文压实，设计低 Token 消耗的高内聚工具，还是引导 Agent 即时探索外部环境，核心原则始终如一：在每一个决策切面，寻找能够触发期望行为的最小有效高信噪比 Token 集合。

更聪明的模型需要更少的教条约束，并拥有更大的自主决策空间。但无论模型参数如何演进，将上下文视作极其宝贵的物理资源，始终是构建可靠、可预期 Agent 系统的基石。

---

> 原文作者署名：Anthropic Applied AI 团队（Prithvi Rajasekaran, Ethan Dixon, Carly Ryan, Jeremy Hadfield；贡献成员包括 Rafi Ayub, Hannah Moran, Cal Rueb, Connor Jennings 等）。  
> 英文原版请访问 [Anthropic 官方工程博客](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)。
