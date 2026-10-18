---
layout: post
title: "PatchCat 第一季收官复盘：从零构建纯端侧 AI 工作流引擎的架构全景与“边写边学”实战手记"
title_en: "PatchCat Season 1 Finale: Architectural Blueprint and Learning-by-Doing Retrospective of a Browser-Native AI Workflow Orchestrator"
date: 2026-10-18 11:35:00 +0800
categories: [AI, Architecture, Engineering]
pub_tag: "Season 1 Finale & Architecture Retrospective"
math: true
read_time: "20 MIN READ"
summary: "历经 26 篇持续攻坚与 592 项全量自动化测试，PatchCat 在 0.4.x 阶段完成了纯浏览器端 Local-First AI 工作流引擎的全部底层原语构建。本文作为开源第一季的收官复盘，系统梳理确定性 DAG 状态机调度、端侧向量与混合检索、Web Crypto 硬件级安全脱敏与版本快照 Diff 架构全景；深入复盘人机双向共创与“像在实验室做功课般边写边学”的研发心流，坦承端侧算力边界与架构代价，正式宣布核心原语封箱并迈向 v0.5.0 稳态新阶段。"
summary_en: "Spanning 26 technical notes and 592 automated tests, PatchCat has completed all browser-native Local-First primitives throughout its 0.4.x era. As the Season 1 finale, this retrospective outlines the full architecture: deterministic DAG state machine scheduling, client-side vector embeddings, Web Crypto vaults, and structural diffing; documents human-AI co-creation and the lab-like learning-by-doing workflow; details architectural trade-offs; and seals core primitives as we step into v0.5.0."
tags: [AI Workflow Orchestration, DAG Engine, State Machine, Local-First, Software Architecture, Learning by Doing, PatchCat]
series: "PatchCat · AI Prompt Flow Orchestrator"
---

> 项目开源地址：[GitHub - PatchCat](https://github.com/GuoBug/PatchCat) · 在线体验：[PatchCat 在线工作台](https://guobug.github.io/PatchCat/)  
> 前篇回顾：📖 [开源系列 26：IndexedDB 工作流版本快照与结构化 DAG Diff 实战]({{ '/posts/2026/10/16/patchcat-workflow-version-snapshots-and-structural-diff/' | relative_url }})

<details>
<summary><b>📚 点击展开查看第一季往期复盘精选 (系列 18 ~ 25)</b></summary>

- 📖 [开源系列 25：从隐式注入到画布显式原语——MemoryNode 架构设计与确定性会话调度]({{ '/posts/2026/10/13/patchcat-memory-node-canvas-visual-primitive/' | relative_url }})
- 📖 [开源系列 24：纯前端端侧向量嵌入与三模混合检索]({{ '/posts/2026/10/12/patchcat-browser-native-vector-embedding-and-hybrid-search/' | relative_url }})
- 📖 [开源系列 23：用 Web Crypto API 加密本地 API Key]({{ '/posts/2026/10/10/ai-prompt-orchestrator-web-crypto-vault-and-zero-plaintext/' | relative_url }})
- 📖 [开源系列 22：纯前端实现 BM25 倒排索引与 RRF 排名融合]({{ '/posts/2026/10/06/ai-prompt-orchestrator-zero-dependency-bm25-and-rrf/' | relative_url }})
- 📖 [开源系列 21：Flow Preflight 语法静态分析与画布连线检查]({{ '/posts/2026/10/03/ai-prompt-orchestrator-flow-preflight-lint-and-simulation/' | relative_url }})
- 📖 [开源系列 20：模型级联路由与失败回退]({{ '/posts/2026/10/02/ai-prompt-orchestrator-cheap-first-model-routing-and-cascade-fallback/' | relative_url }})
- 📖 [开源系列 19：Agent 重复调用检测与熔断]({{ '/posts/2026/10/01/ai-prompt-orchestrator-agent-deadlock-and-circuit-breaker/' | relative_url }})
- 📖 [开源系列 18：DAG 检查点与断点续跑]({{ '/posts/2026/09/30/ai-prompt-orchestrator-dag-checkpoint-and-reverse-bfs/' | relative_url }})

</details>

---

26 篇工程手记写下来，PatchCat 从一张 React Flow 画布，长出了拓扑排序调度、端侧向量模型、本地加密库和结构化 Diff 引擎。走到这一步，该停下来做个交代了。

第 4.20 轮代码审计刚过，全量自动化测试到了 **592 项**（172 个测试套件），全绿。这意味着 `0.4.x` 这 20 个迭代周期里，我们为纯浏览器端 Local-First **AI 工作流编排**（AI Workflow Orchestration）预设的底层原语，都验证完了，也拼装完了。

这篇收官复盘不聊虚的，把系统架构从头到尾捋一遍，说说“边写边学”是怎么一路趟过来的，最后正式宣布核心原语封箱、版本号往上跳一格。

![PatchCat Season 1 Finale Architecture Cover]({{ '/assets/images/cover-patchcat-season-1-finale-architecture.jpg' | relative_url }})

## 一、为什么死磕 Local-First：数据主权得还给浏览器

做工作流编排工具，最顺手的路子是在服务器端架个 Python 或 Node.js 后端，用户的 API Key、拓扑逻辑、提示词、历史会话统一塞进云端数据库。工程上省事，但用户的数据掌控权就这么被悄悄拿走了。

立项时我们就定了 Local-First 的纯前端架构：除了调用大语言模型的外部接口，所有运算全部跑在用户的浏览器主线程和 Web Workers 里。

![PatchCat Season 1 Full Architecture SVG]({{ '/assets/images/flowchart-patchcat-season-1-full-architecture.svg' | relative_url }})

在没有云端算力兜底的沙盒里跑工作流，数据和计算上我们做了三件事：

1. 零明文 Web Crypto 密钥保险库：API Key 不存明文 `localStorage`。底层用 PBKDF2 强派生加 AES-GCM-256，主密钥由浏览器内部独立管理。节点执行时在内存里动态解密、用完即擦，静态落盘和快照导出都是脱敏的。
2. 浏览器内端侧混合检索：不挂云端向量数据库。独立 Web Worker 里跑量化版 BGE-small 嵌入模型，配零依赖手写的 BM25 倒排索引和 RRF 无参数融合，毫秒级完成本地知识库私密检索。
3. IndexedDB 双模持久化与不可变会话：长效会话切片显式抽象成 MemoryNode 原语，不再隐式挂在全局上下文里当黑盒变量，任何一次提示词拼接头都能正向复现。

换来的是绝对的信任——用户的商业机密提示词、私域数据和模型密钥，不需要经过任何第三方中间服务器。

## 二、确定性工作流与 DAG 状态机调度全景

大模型的输出天然不确定。如果上层流程编排也跟着随机，系统迟早滑向不可维护的混沌。PatchCat 的核心目标，就是用严密的图论调度约束，给上层应用套一层**确定性工作流**。

底层 **DAG 状态机**（DAG Engine / State Machine）靠四个互相咬合的机制保调度稳定：

```
[Flow Preflight 静态语法分析] ➔ 阻断孤岛与悬空连线
              ↓
[Kahn 拓扑排序调度队列] ➔ 基于入度计算无环依赖
              ↓
[运行时死锁看门狗熔断] ➔ 动态截断振荡与无限死循环
              ↓
[检查点反向 BFS 拓扑续跑] ➔ 局部异常仅重跑受损子树
```

1. Kahn 拓扑排序与动态入度计算：执行器维护一张动态入度表。一个节点的所有前驱都执行完、数据契约校验通过，它才被推进就绪队列。并行分支能最大吞吐并发，汇聚分支严格等全部前置上下文就绪。
2. 环路死锁看门狗：动态条件循环场景下，看门狗探针盯着。某个循环回路缺收敛判据、触发高频振荡时，调度器果断熔断报错，不让主线程陷进停不下来的事件循环。
3. 检查点与反向 BFS 局部续跑：某节点因远端服务波动失败，用户改完提示词不用从头跑全图。调度器反向广度优先搜索，向上追依赖边界，复用历史执行快照，只重新调度脏节点和它的下游子图。
4. 模型级联路由与优雅回退：线上遇到 429 速率限制或偶发超时，路由节点支持廉价轻量模型优先、自动级联降级，兜住流水线最终可用性。

## 三、边写边学：像在实验室做功课

回头看这 26 篇手记，要是包装成“从一开始就洞悉一切的完美架构设计”，不光违背事实，也丢了开源工程最宝贵的东西。

说实话，PatchCat 全程借助 AI 辅助编程、按标准的**边写边学**（Learning by Doing）一点一点敲出来的。那状态特别像大学在计算机和物理实验室做实验、做功课。

![PatchCat Learning by Doing Lab Oil Painting]({{ '/assets/images/intext-patchcat-learning-by-doing-experiment-lab.jpg' | relative_url }})

做实验没人能直接背出现成结论。规范做法永远是三步：

- 先提假设和对照组：比如“用户在画布上删了连线重新连，为什么 JSON 字符比对会出现红绿假阳性？”
- 搭测试仪器、构造极端边界：写断言用例，主动往有向图里注入死循环回环，把几万字提示词灌进 LCS 动态规划矩阵，看主线程什么时候崩；
- 记录现象、深挖底层原理：翻算法论文，查 MDN 和 W3C 规范，弄懂状态切片和计算复杂度的本质，直到测试全绿。

这个过程里，AI 不是替身代写，更像一位随时坐在旁边的“高水平实验搭子”。人与 AI 是双向启发、互相权衡的关系：

- 人提的关键节点，来自真实产品体验和痛点：单画布放不下多轮复杂分支、本地私密 Key 不能明文泄露、改坏提示词不敢刷新页面；
- AI 提的关键节点，来自底层工程规约和系统隐患：React Flow 脏渲染对主线程的消耗、有向图拓扑环路的死锁机理、多标签页并发写 IndexedDB 触发的 `onblocked` 阻塞。

每个关键架构方案提炼出来，我们都不直接照搬大段现成代码，而是先比内存消耗和算法时间复杂度，逐段剖析数据流转，最后亲手写自动化测试用例，实测通过才合并。正是这种“实验室做功课”式的推演，让一张看似简单的前端画布沉淀出 592 个测试项的高韧性体系。

## 四、方案代价与物理边界

任何真实工程实践都不是万灵药。纯端侧编排方案，PatchCat 同样有清晰的物理边界和性能代价：

1. 浏览器主线程的算力天花板：端侧向量模型虽然量化压缩过，初次加载仍要下几十兆权重文件，占约 150MB 到 300MB 浏览器堆内存。上万篇长文本的大规模知识库，端侧计算效率必然落后专用服务端向量集群。
2. 快照存储与 LCS 比对的防御性退化：怕版本快照撑爆 IndexedDB 配额，我们设了 30 个版本的硬阈值，重度用户得定期手动清理归档；为防止 LCS 在超大节点下卡死界面，行级比对设了 4,000,000 单元格熔断限制，超了自动退化成块级比对。
3. 跨标签页数据库版本升级锁：用户在多个标签页同时打开 PatchCat 并触发数据库 Schema 变更时，IndexedDB 原生锁机制可能让升级挂起。我们加了连接释放兜底，极端并发下仍得靠优雅降级策略。

## 五、总结与展望：迈向 v0.5.0

到这儿，PatchCat 开源连载第一季正式收尾。

一路回顾，从空白画布组件出发，完整实现了：

- 图论拓扑排序、环路熔断、断点续跑；
- 纯前端向量嵌入、BM25 与 RRF 混合检索；
- Web Crypto 零明文保险库与只读会话原语；
- Flow Preflight 静态语法分析与字段级 DAG Diff。

这不只是一套开源工具的成型记录，更像一份把理论算法落到复杂前端工程里的实验报告。它说明没有庞大的后端集群，光靠现代浏览器标准能力和严谨的状态机设计，一样能搭出兼具数据主权与工业级可靠性的编排底座。

第一季底层原语全面封箱，PatchCat 版本号从 `v0.4.x` 跳到 **v0.5.0**。接下来要告别底层造轮子阶段，转向更开阔的真实业务场景和可复用生态探索。

我们清楚自身水平有限，文中和代码里难免有疏漏。真诚欢迎社区同行和资深架构师做白盒审查、批评指教，一起摸索确定性 AI 系统的工程可能。

---

> **关于作者**  
> **郭强 (GuoBug)**，Product Engineer，做平台工程也做业务增长。目前主要在折腾 AI 工作流编排、DAG 状态机与确定性系统架构。  
> 开源项目与主页：[https://github.com/GuoBug](https://github.com/GuoBug) · [https://guobug.github.io](https://guobug.github.io)  
> 欢迎就工作流引擎架构、拓扑调度和低门槛开发体验交流指教。