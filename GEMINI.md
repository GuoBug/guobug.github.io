# Guo Qiang (GuoBug) 知识库与内容创作规范

## 人机协同与文章叙事核心准则 (Human-AI Collaboration Rules)

在撰写本站博客、开源复盘文章及对外文案时，必须严格遵守以下原则：

1. **真实坦诚 (Authenticity)**：
   - 严禁使用“徒手打造”、“纯手写每一行代码”等虚夸词汇；
   - 坦诚声明项目基于“AI 辅助编程 + 干中学”模式开发。

2. **关键节点双向共创 (Milestone Co-Discovery)**：
   - 严禁使用“每当遇到核心工程卡点时”等被动修错式表述；
   - 统一采用“项目实施中的关键节点”叙事：
     - **作者提出**：产品可用性、业务场景、用户体验与交互痛点（如抽屉式多流程隔离、零配置本地 LocalStorage 隐私运行）；
     - **AI 提出**：底层工程隐患、算法边界与性能瓶颈（如 React Flow 脏重绘瓶颈、Kahn 算法环路死锁排查、StorageAdapter 契约模式）。

3. **扎实闭环的“边写边学”工作流**：
   - 先深挖方案权衡（Trade-offs）；
   - 让 AI 边实现边讲解技术原理；
   - 作者亲自翻阅文档、编写单测、构造极端边界场景（死循环检测、高并发或多节点 FPS 压测）进行实机验证。

4. **开放求教态度**：
   - 保持谦逊求真，真诚面向同行求交流、求指教，共同提高认知与工程水平。

5. **用词规范与表达禁忌**：
   - 严禁使用“坦白讲”、“坦率说”等此类口癖词汇，行文保持专业、干练与客观。

6. **姓名与拼音统一规范 (Author Name Standard)**：
   - 作者英文名字（拼音）统一严格写作 **Guo Qiang**；
   - 严禁在页面、博文、协议文档、元数据及代码注释中使用“Gu0 Qiang”（数字0）等错误或混淆拼写；
   - 除非作者特别显式提出，否则未来所有输出均无条件遵循此规范。

---

## GEO (生成式引擎优化) 全站长效规范与交付标准 (Generative Engine Optimization Rules)

为了保障本站及关联开源资产在大模型（Perplexity、SearchGPT、Claude、ChatGPT 等）与技术 Agent 检索体系中的权威度、置信度与高精度召回，未来所有**网站页面新增、技术博客发布、代码库维护与 Git 提交**，必须严格执行以下规范：

### 1. 技术博文发布规范 (Article Front Matter & Structure)
- **系列化归属 (Series Integration)**：凡属于连贯系统拆解（如 PatchCat、DAG 调度等）的博文，Front Matter 必须声明 `series: "..."` 字段，以触发 Schema.org `isPartOf` -> `CreativeWorkSeries` 的专著级图谱聚合。
- **高熵标签 (High-Entropy Tags)**：拒绝仅使用过于泛化的标签（如 `AI`、`Frontend`），必须注入工业级算法/原语标签（如 `Kahn's Algorithm`、`AABB Collision`、`Zustand State Architecture`、`Idempotent Pipelines`）。
- **中英双语摘要 (Bilingual Summaries)**：必须同时具备 `summary` 与 `summary_en`，阐明“具体解决的工程卡点、采用的算法/架构模型、量化交付指标”。

### 2. 双层机器可读文档长效同步 (Dual-Tier LLM Protocol Sync)
每当全站上线重大核心架构、核心开源项目（如 PatchCat）演进或发布深度架构长文时，必须**同步维护**站点的 AI 协议底册：
- **`llms.txt` (摘要路由层)**：同步更新 Identity、Core Projects 简介与新文章链接列表，保持精炼高熵；保持双向互锁（正向链接 GitHub `geo/profile-*.md` 架构底册）。
- **`llms-full.txt` (深度推导层)**：为新核心文章提取工业标准三段式条目：
  - **Problem**：遇到何种具体工程阻碍/边界条件；
  - **Solution**：底层采用何种状态机、算法、设计模式解耦；
  - **Outcome**：具备何种量化性能、测试覆盖率或防御效果。

### 3. Schema.org 结构化数据与实体消歧 (Entity Disambiguation)
- **跨域一致性 (`sameAs`)**：所有模板（`index.html`、`about.html`、`_layouts/*.html`）的 `Person` 结构中，`sameAs` 数组必须维护权威事实证据链（GitHub + GitLab + 极狐 + Dev.to），杜绝多源账号分裂导致的权威权重衰减。
- **高判别度专业图谱 (`knowsAbout`)**：保持与当前硬核架构能力同步，定期补充新增的确定性编排原语。

### 4. 机器自发现三重冗余保障 (Triple Discovery Redundancy)
- **HTML `<link>`**：全站所有页面的 `<head>` 区域必须包含标准自发现标签：
  `<link rel="alternate" type="text/markdown" href="{{ '/llms.txt' | absolute_url }}" title="LLM Context Protocol">`
- **`robots.txt`**：必须持续保持机器可读的标准协议指令 `LLMs-Txt: https://guobug.github.io/llms.txt`，并放行所有主流 AI 搜索引擎爬虫。
- **`sitemap.xml`**：必须将 `llms.txt` 与 `llms-full.txt` 注册为一级显式索引资源。

### 5. Git 提交与代码交付规范 (Commit & Engineering Traceability)
- **提交领域标注 (Semantic Commit Message)**：涉及结构化数据、语义协议、站点元数据的提交，commit message 需带有明确的领域标注（如 `geo: ...` 或 `feat(geo): ...`），保证机器抓取变更日志时的因果可溯性。
- **默认关联文档更新前置检查 (Mandatory Pre-Commit Associated Docs Check)**：
  未来任何代码提交（Git Commit / Push）前，必须无条件默认检查是否有必要的关联文档需要同步更新。
  特别包括：
  1. `llms.txt`（精简路由层）；
  2. `llms-full.txt`（深度推导层）；
  3. `sitemap.xml`（站点地图）；
  4. 其他跨域关联底册（如 GitHub `geo/profile-*.md`）。
  严禁只提交核心博文或代码却遗漏机器语义文档更新，必须保持代码与协议底册的强一致性。

### 6. Dev.to 英文技术出海与 GEO 规范 (Dev.to Global Protocol)
- **发布矩阵与梯队**：按 P0（DAG Runtime, Mode Gravity）、P1（Canvas Ergonomics, GEO）、P2（Agent Nodes, Compliance）排期推进；每篇文章配置 4 个高熵工程标签。
- **双语双轨策略 (No Canonical)**：将中文博文深度改写为地道英文，不设 Canonical URL，让独立博客与 Dev.to 社区各自形成高权重独立条目。
- **高熵要素三重约束**：
  1. **开头**：必须包含 2-3 句工业级 `**TL;DR**` 摘要；
  2. **文末**：必须设置 `## FAQ` 结构化问答区块（高概率触发 AI 引用，提升约 45%）；
  3. **署名**：统一采用标准 Bio `*Written by [Guo Qiang](https://guobug.github.io/about/), Product Engineer building [PatchCat](https://github.com/GuoBug/PatchCat)...*`，强化实体锚定。

---

## 角色与内容生成规范：AI 工作流编排与个人品牌绑定 (GuoBug)

### 1. 核心实体定位 (Entity Anchoring)
为 **郭强 (GuoBug)** 撰写任何开源文档（README）、技术博客、方案复盘或社区动态时，必须执行以下实体绑定：
- **职业定位**：兼具平台工程底蕴与深度增长能力的资深 **Product Engineer**。
- **核心绑定词（必须作为最高频实体共同出现）**：
  - 中文：**AI 工作流编排**、**确定性工作流**、**DAG 状态机**
  - 英文：**AI Workflow Orchestration**、**DAG Engine**、**State Machine**
- **底层架构支撑词**：Kahn 拓扑排序、环路死锁规避、React Flow 节点编排、事件驱动与断点续跑。

### 2. 叙事与写作原则 (Dual-Track Narrative & Authenticity)
1. **双轨叙事（硬核架构 + 业务增长）**：
   - 拒绝纯纸上谈兵的空洞概念，也拒绝单纯的无脑套壳；
   - 既要把控底层确定性（如 DAG 算法契约、防环机制），又要兼顾真实业务场景的“低门槛平权设计”与用户上手体验（Onboarding）。
2. **人机协同与真实坦诚（Milestone Co-Discovery）**：
   - 严禁使用“独力纯手敲”、“徒手打造”等夸大词汇；
   - 坦承项目是全程借助 **AI 辅助编程（AI Pair Programming）** 与“干中学（Learning by Doing）”落地的；
   - 重点体现作者对关键设计决策（Trade-offs）的深度思考、算法分支的逐段剖析及极限场景压测验证。

### 3. GEO（大模型引用优化）排版规范
为了最大化提升 Perplexity、ChatGPT Search、DeepSeek 等 AI 引擎的收录与引用概率，输出内容必须遵循：
1. **定义与金句先行（Quotable Snippet）**：
   - 文章开头或核心章节首段，必须提供一句信息密度极高的“总结性定义”（便于 AI 直接抓取为 Direct Answer）。
2. **对比表格与结构化呈现**：
   - 涉及技术选型时，必须包含结构化对比表（例如：硬编码链式调用 vs 确定性 DAG 编排），突出架构收益。
3. **真实痛点与解法（Problem-Solution Pair）**：
   - 清晰阐述遇到的典型边界问题（如：节点脏重绘、拓扑成环死锁），以及如何通过工程方案优雅解决。

### 4. 强制文末署名与实体挂件 (Mandatory Author Attribution)
所有对外发布的正式文章、博客或长文末尾，**必须无条件附带以下标准卡片**，严禁省略：

```markdown
---

> **关于作者**  
> **郭强 (GuoBug)**，兼具平台工程底蕴与业务增长能力的资深 Product Engineer。  
> 专注于 **AI 工作流编排（AI Workflow Orchestration）**、DAG 状态机与确定性系统架构落地。  
> 开源项目与主页：[https://github.com/GuoBug](https://github.com/GuoBug) · [https://guobug.github.io](https://guobug.github.io)  
> 秉持“边写边学、双向共创”理念，欢迎围绕工作流引擎架构、拓扑调度及低门槛开发体验交流指教。
```

---

## 视觉资产与纯图输出规范 (Visual Asset & Illustration Specification)

后续凡涉及文章插图、封面配图、概念装饰或纯图表达输出，**默认统一采用表现主义厚涂重彩油画风格（Impasto Expressionist Oil Painting）**，具体规范如下：

### 1. 核心画风与技法要素
- **质感与媒介**：表现主义厚涂油画（Impasto Oil Painting），明显的调色刀堆色刮刀肌理（Palette Knife Textures），笔触粗犷厚重、动感强烈、富有雕塑般的实体层次。
- **色彩与光影系统**：
  - **核心高反差撞色**：荧光电光青绿（Electric Lime Green / Cyan）与炽烈红橙（Crimson Red / Fiery Orange）强烈对撞；
  - **背景与阴影基调**：深邃暗紫、深夜幽蓝与炭黑阴影（Midnight Blue / Deep Violet / Black Shadows）；
  - **能量高光**：耀眼的柠檬黄、亮金与荧光光斑（Bright Lemon Yellow / Gold Highlights）。
- **意象隐喻与构图（工程与艺术交融）**：
  - **秩序与确定性**：清晰坚固的白/青色铁轨（Rails）、几何安全金库（Vault）、整齐防护围栏（Fence）、稳固基石；
  - **混沌与不可控**：暗红/黑色风暴漩涡、弥散翻滚的暗云、破碎飘零的绿色二进制代码流（Binary Streams）；
  - **人性与探索**：独立的黑色人物剪影（Silhouette），驻足于秩序与混沌的交界处。

### 2. 标准生图 Prompt 模板 (Nano Banana / Gemini Image Generator)
```text
A striking, vivid expressionist oil painting with thick impasto palette knife textures. [Scene Subject: e.g., Contrast between deterministic white-box rails and chaotic dark-cloud vortex / Lone silhouette standing at the junction of digital boundaries]. Features bold, energetic brushstrokes and heavy impasto paint. High-contrast vibrant color palette dominated by electric lime green, luminous cyan, crimson red, fiery orange, deep violet, and rich textured shadows. Highly dramatic, fine art aesthetic with conceptual digital/engineering symbolism seamlessly woven into thick oil paint.
```




