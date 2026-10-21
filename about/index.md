Last Updated: 2026-10-22

# Guo Qiang (郭强 / GuoBug)

**Product Engineer · AI 产品架构师 / Agent Runtime & 工作流系统负责人**  
上海 · 远程 (All-Remote) ｜ 邮箱：[gu0bug0@gmail.com](mailto:gu0bug0@gmail.com) ｜ [GitHub](https://github.com/GuoBug) ｜ [个人主页](https://guobug.github.io) ｜ [在线交互简历](https://guobug.github.io/about/)

---

## 个人定位与技术特质 (Profile & Positioning)

我是一名兼具平台工程底蕴与深度增长能力的资深 **Product Engineer** / **AI 产品架构师**。拥有 14 年从底层系统、商业增长、SaaS 平台治理到一手构建确定性 AI 系统的复合经验。

曾任 **极狐 GitLab (CN)** 产品专家，负责中国区 SaaS 平台规划、多租户安全风控与产品增长；此前在 **哔哩哔哩**、**携程** 主导高并发业务架构与千万级用户增长漏斗；早年在商业银行核心系统积累了扎实的 C 语言与 Linux 内核工程底子。

在 AI 时代，我践行 **AI Pair Programming** 与“干中学”：告别浮于表面的 Prompt 抽卡，专注于 **Agent Runtime（执行底座）**、**端侧 DAG 调度引擎**、**本地优先智能体工作流** 与确定性系统的构建。由业务场景定义核心产品边界，由 AI 启发底层规约与死锁排查，并通过极端边界压测完成工程闭环。

---

## 核心能力矩阵与业务映射 (Core Competencies & Matrix)

面向 AI 招聘（HR/ATS 关键词检索）与系统架构评测，我的核心能力映射如下：

| 维度 | HR / ATS 检索高频词 | 落地工程原语与系统解法 | 代表性资产与项目实证 |
| :--- | :--- | :--- | :--- |
| **AI 产品与智能体工作流** | AI产品经理、Agent架构师、智能体工作流、端侧 RAG、上下文工程、防幻觉护栏、全链路评测、0到1商业化 | Kahn 拓扑排序调度、端侧 500 行 BM25 + 本地向量混合检索（RRF）、双锚点滑动窗口原子裁剪、F7 语义门禁、McNemar 配对卡方检验 | [PatchCat 开源工作流引擎](https://github.com/GuoBug/PatchCat) (592 单测，React 19 纯度合规) / 26 期架构实战复盘 |
| **确定性系统与执行底座** | Agent Runtime、DAG 状态机、故障容灾断点续跑、工具沙箱与死锁熔断、本地优先 (Local-First)、数据主权 | 逆向 BFS 检查点断点恢复、ReAct 连续 3 次死锁特征签名硬熔断、Web Crypto AES-256 本地密钥金库、IndexedDB v7 拓扑指纹快照与 LCS 结构化 Diff | PatchCat 运行时内核、早期商业银行 Linux 0.11 C 语言核心代码底子 |
| **商业化增长与 SaaS 治理** | 平台产品负责人、SaaS 商业化、PLG Onboarding 漏斗优化、多租户风控合规、高并发架构、开放平台 SDK | 极狐 GitLab 中国区 SaaS 增长与合规全生命周期风控、全链路渠道归因、首屏引导完成率 +8%、携程/B站高并发移动端增长黑客 | 极狐 GitLab 50+ 项公开 Parent Epics & Issues、跨国开源主干协同反向合入 |

---

## 核心项目经历 (Core Projects)

### 1. PatchCat（开源端侧 AI 提示流编排器与 Agent Runtime）｜2024.09 至今｜0→1 Owner
- **项目主页**：https://github.com/GuoBug/PatchCat
- **在线体验**：https://guobug.github.io/PatchCat/
- **定位**：面向复杂多轮创作与业务自动化场景，从 0 到 1 架构并交付纯端侧、本地优先的 AI 工作流编排引擎。累计交付 592 个自动化单测（172 个测试套件，React 19 纯度合规），沉淀 26 篇硬核工程手记。
- **Agent Runtime 执行底座**：
  - 基于 Kahn 算法实现端侧有向无环图拓扑排序与波前并发调度；构建静态 AST 与可达性分析，实现成环死锁与幽灵依赖的毫秒级拦截。
  - 建设逆向 BFS 检查点拓扑回溯与断点续跑机制，结合 immutable JSON 快照实现局部拓扑状态安全复用。
- **工具沙箱与防死锁看门狗 (Circuit Breaker)**：
  - 针对 ReAct Agent 在异步轮询中的死锁陷阱，提取工具调用特征签名（`callSig`）；第 2 次相同调用注入柔性反思提示，连续第 3 次相同调用触发硬熔断看门狗，彻底终结 Token 泄漏与原地死循环。
- **端侧 RAG 混合检索与向量引擎**：
  - 手写 500 行零依赖纯前端 BM25 倒排索引，结合 Web Worker 隔离运行本地量化向量模型（BGE-small ONNX）；
  - 部署无参倒数排名融合（RRF，k=60），彻底弥合字面精确匹配（如代码报错 ID）与语义泛化的断层，实现亚 50ms 纯端检索与 100% 本地数据主权。
- **上下文工程与提示词防退化**：
  - 落地双锚点滑动窗口与原子事务裁剪流水线：锁定系统提示词与首轮目标为不可变双锚点，消除 100% 目标漂移；滑动窗口内打包工具调用原子交互轮次，杜绝 ChatML HTTP 400 崩溃，维持云端 Prompt Prefix Caching 命中率。
- **安全金库与版本状态管理**：
  - 基于 Web Crypto API（SubtleCrypto AES-256-GCM + PBKDF2 60万次迭代）构建本地密钥保险库，物理隔离明文 API Key；
  - 升级 IndexedDB v7 工作流快照存储，基于规范化 SHA-256 拓扑指纹与二维 LCS 算法实现结构化 DAG Diff 与无损回退。

---

## 职业演进历史 (Work Experience)

### 喵嗷呜科技工作室 · PatchCat 开源项目｜联合创始人 / AI 产品架构师 & 主理人｜2024.09 至今
- 主导开源端侧 Agent 工作流引擎 PatchCat 的从 0 到 1 架构规划与交付；
- 搭建企业级自动化流水线，基于确定性 DAG 状态机、端侧 RAG 检索与沙箱隔离实现高可靠业务闭环；
- 剥离具体电商业务规则后，将核心编排底座完全开源，持续引领端侧智能体与本地优先架构演进。

### 极狐 GitLab｜产品专家 / SaaS 与平台产品负责人｜2022.02 – 2024.09
- 主导中国区 SaaS 平台规划与 GTM 策略，管理跨时区国际化分布式产研协同；
- **平台合规风控 (母战役 Epic #5398)**：规划并落地多租户风控合规全生命周期体系（手机号合规底座 #2287、虚拟邮箱防御 #2506、项目创建沙箱 #2508 与隐私合规 #5453）；
- **SaaS 数据指标基建 (核心 Epic #5319)**：主导集成 PostHog 搭建自主可控的产品数据分析系统与异步定时 Pipeline 解耦调度；
- **PLG 体验打磨与获客**：主持交互式动手实验新用户 Onboarding 引导流程，推动企业新用户首次引导配置完成率提升 8% 以上；
- **全球主干协同**：对齐 GitLab Global 核心团队将本地计费规格反向合入全球主干 (#2578)。

### 上海仙泽分析仪器｜软件与平台产品负责人｜2019.08 – 2022.02
- 面向制药与科研院所高精度光谱分析场景，主导工作站软件与 SaaS 平台架构；
- 从 STM32 寄存器、实时系统通信协议到 C# .NET 上位机软件，完成工业软硬件全链路交付并建立 Jira 敏捷体系。

### 携程 · 哔哩哔哩 · 爱乐奇｜移动主站产品 / 增长黑客｜2014 – 2019
- **携程 (Ctrip)**：负责移动营销分销、APP 推广、SEO/SEM、广告/API 平台及订单流程优化，深谙获客与全链路转化；
- **哔哩哔哩 (Bilibili)**：负责移动主站平台及移动商业化需求，处理高并发业务场景与用户心智闭环。

### 商业银行核心业务系统｜底层系统软件工程师｜2012 – 2014
- 参与商业银行核心交易系统与批量清算切片研发，深入 Linux 0.11 内核内存模型与 C 语言高可靠工程规范。

---

## 技术关注与研究领域 (Technical Focus)

- **Agent Runtime & Deterministic Workflows**：Kahn 拓扑调度、波前并发、ReAct 看门狗、逆向 BFS 检查点断点恢复、状态机契约。
- **Local-First & Browser-Native AI**：Web Worker 向量模型推理、端侧 500 行 BM25 倒排索引、三模 RRF 混合检索、Web Crypto 密钥安全。
- **Context Engineering & Evaluation**：Prompt Prefix Caching、双锚点上下文裁剪、F7 语义冲突门禁、双轴正交归因模型、McNemar 统计检验。
- **Enterprise Platform & Growth**：多租户风控合规体系、全链路自主数据遥测、PLG 新用户 Onboarding 转化漏斗、开源全球主干协同。

---

## 代表作与架构专著 (Featured Technical Writings)

- [《Zero-Backend AI: Running Local Embeddings, BM25, and Hybrid RRF Search 100% in the Browser》](https://guobug.github.io/posts/2026/10/18/zero-backend-browser-native-hybrid-search-bm25-rrf/)
- [《Visual Guide to True AI-Native Applications: Deconstructing Architecture Patterns with PatchCat》](https://guobug.github.io/posts/2026/10/09/visual-guide-to-ai-native-applications-and-architecture/)
- [《Building a Client-Side DAG Runtime with Kahn's Algorithm》](https://guobug.github.io/posts/2026/09/21/building-a-client-side-dag-runtime-with-kahns-algorithm/)
- [《PatchCat 第一季收官复盘：从零构建纯端侧 AI 工作流引擎的架构全景与实战手记》](https://guobug.github.io/posts/2026/10/18/patchcat-season-1-finale-local-first-orchestrator-architecture/)
- [《从 0 到 1 打造 AI 提示流编排器：别让 Agent 原地鬼打墙！连续 3 次相同工具调用的硬熔断》](https://guobug.github.io/posts/2026/10/01/ai-prompt-orchestrator-agent-deadlock-and-circuit-breaker/)
- [《从 0 到 1 打造 AI 提示流编排器：失败了别全盘重来！逆向 BFS 拓扑回溯与 DAG 检查点断点续跑》](https://guobug.github.io/posts/2026/09/30/ai-prompt-orchestrator-dag-checkpoint-and-reverse-bfs/)
- [《从 0 到 1 打造 AI 提示流编排器：告别上下文黑洞 —— 双锚点滑动窗口与原子事务裁剪实战》](https://guobug.github.io/posts/2026/09/29/ai-prompt-orchestrator-context-engineering-dual-anchor-pruning/)
