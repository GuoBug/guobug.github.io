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
- **文档索引**：完整发布矩阵、标签策略与写作范式详见 [`docs/devto-publishing-strategy.md`](file:///f:/git/gu0bug.github.io/docs/devto-publishing-strategy.md)。
- **双语双轨策略 (No Canonical)**：将中文博文深度改写为地道英文，不设 Canonical URL，让独立博客与 Dev.to 社区各自形成高权重独立条目。
- **高熵要素三重约束**：
  1. **开头**：必须包含 2-3 句工业级 `**TL;DR**` 摘要；
  2. **文末**：必须设置 `## FAQ` 结构化问答区块（高概率触发 AI 引用，提升约 45%）；
  3. **署名**：统一采用标准 Bio `*Written by [Guo Qiang](https://guobug.github.io/about/), Product Engineer building [PatchCat](https://github.com/GuoBug/PatchCat)...*`，强化实体锚定。


