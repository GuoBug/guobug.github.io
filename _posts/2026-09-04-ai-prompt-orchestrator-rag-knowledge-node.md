---
layout: post
title: "从 0 到 1 打造 AI 提示流编排器：从 Dify 学习知识库架构，实现私有文档检索与 RAG 画布节点（开源系列 05）"
title_en: "Building AI Prompt Orchestrator: Learning Knowledge Architecture from Dify, RAG & Vector Search Node"
date: 2026-09-04 00:30:00 +0800
categories: [AI, Architecture, RAG]
pub_tag: "AI & RAG"
summary: "向顶流开源项目 Dify 学习知识库系统架构，在 PatchCat 编排器中从零落地三层数据模型（KnowledgeBase ➔ Document ➔ DocumentChunk）、滑动分块清洗（50 字符 Overlap 防断裂）、向量余弦检索与科技青蓝 RAG 画布节点的“干中学”实战复盘。"
summary_en: "Learning enterprise RAG architecture from Dify: 3-tier decoupled model, sliding window chunking with 50-char overlap, vector cosine search, and Cyan knowledge node on canvas."
read_time: "14 MIN READ"
tags: [AI, RAG, Dify, Vector Search, React Flow, FastAPI, Architecture, Open Source]
---

> **项目开源地址**：[https://github.com/GuoBug/PatchCat](https://github.com/GuoBug/PatchCat)  
> **在线体验**：[https://guobug.github.io/PatchCat/](https://guobug.github.io/PatchCat/)  
> **往期回顾**：  
> 📖 [《从 0 到 1 打造 AI 提示流编排器：双引擎架构与纯前端 DAG 实践（开源系列 01）》]({{ '/posts/2026/08/28/ai-prompt-orchestrator-dual-engine/' | relative_url }})  
> 📖 [《从 0 到 1 打造 AI 提示流编排器：Kahn 拓扑排序、安全变量引擎与异步运行时实战（开源系列 02）》]({{ '/posts/2026/08/28/ai-prompt-orchestrator-kahn-runtime/' | relative_url }})  
> 📖 [《从 0 到 1 打造 AI 提示流编排器：多模型生态适配、流式思维链与三级日志实战（开源系列 03）》]({{ '/posts/2026/09/01/ai-prompt-orchestrator-multi-model-observability/' | relative_url }})  
> 📖 [《从 0 到 1 打造 AI 提示流编排器：告别单画布重绘瓶颈，状态机分层解耦与双模存储实战（开源系列 04）》]({{ '/posts/2026/09/03/ai-prompt-orchestrator-multi-workflow-dual-storage/' | relative_url }})

---

## 一、 引言：为什么单靠 Prompt 编排已经不够用了？

在前面四篇文章中，我们为开源 AI 提示流编排器 **PatchCat** 搭建起了拓扑调度引擎、极简暗黑画布、以及抽屉式的多流程管理底座。在纯提示词编排场景下，输入参数通过模板拼接直接送入大模型，整个系统跑得轻快而流畅。

然而，当我们在实际业务场景中开始设想构建“企业客服分流”或“内部技术手册问答助手”时，单纯依赖 Prompt 模板的局限性立刻暴露无遗：

1. **时效性与知识盲区**：大模型拥有海量的通用世界常识，但它对我们刚刚写好的内部接口文档、最新的售后政策一无所知；
2. **不可控的幻觉**：如果仅靠在 System Prompt 里硬塞有限的规则，一旦用户提问超出范围，模型便会开始煞有介事地“胡说八道”；
3. **上下文窗口成本**：把数十万字的开发手册全部作为上下文塞给每次对话，不仅价格高昂，还会受到上下文长度与响应延迟的双重制约。

**编排器必须迎来一次质的蜕变 —— 我们不能仅仅拥有 `Prompt` 和 `LLM` 节点，必须给画布装上“私有知识库第二大脑”。**

这意味着，画布上需要一个全新的 <strong>【知识库检索节点 (Knowledge Node)】</strong>：用户在前面输入问题，该节点能够实时在后台私有文档库中进行向量语义召回，把最相关的几个文档段落组装成结构化引文，再动态“投喂”给下游的提示词与大模型。

坦白讲，面对涉及向量数据库、文本分块、嵌入模型等一整套未知的 RAG 体系，我一开始并没有完整的工业级架构经验。但正如前几篇文章所倡导的，**整个项目全程借助 AI 结对辅助编程（AI Pair Programming）与“干中学（Learning by Doing）”的方式扎实推进**。我们决定不闭门造车，而是直接研读目前开源界公认标杆 **Dify** 的知识库架构与设计文档，从中汲取成熟的工程养分，一步步在 PatchCat 中完成落地。

---

## 二、 关键决策与双向共创：向 Dify 优秀架构学习

在系统设计之初，我和 AI 搭档并没有急于动笔写代码，而是围绕技术选型展开了多轮深入的推演与方案权衡。人与 AI 形成了非常契合的双向启发：

### 1. 三层关系模型设计：向 Dify 优秀架构取经
- **我提出的业务痛点**：在查阅一些极简 RAG 教程时，发现很多初学者喜欢把上传的文件和切出的段落一股脑揉进一张平铺的数据库大表里。但在真实业务中，一个知识库可能包含几十个文档，每个文档有版本迭代、重命名、重新分块或单独删除的需求。平铺存储会导致后续知识库维度的字符统计、文档管理极度混乱。
- **研读 Dify 架构获得的启发**：仔细研读 Dify 的知识库文档后，深感其**经典三层树状解耦模型**的严谨与优雅：
  - **知识库层 (`KnowledgeBase`)**：作为顶级容器，维护 Embedding 模型类型、向量维度、检索策略以及文档数/切片数等统计指标；
  - **文档层 (`Document`)**：记录原始源文件元数据（文件名、字符数、处理状态机 `queuing ➔ indexing ➔ completed`）；
  - **切片层 (`DocumentChunk`)**：存储纯文本段落、序号位置 `position`、Token 估算量、稠密向量 `embedding` 以及命中热度 `hit_count`。
- **AI 搭档提出的工程规约**：AI 搭档在肯定三层结构的同时，敏锐地指出了底层数据库的隐患：在异步 SQLAlchemy 2.0 中，三层级联删除如果不显式设置外键级联，在批量删除知识库时极易触发大量额外的查询甚至遗留悬空孤儿记录。由此，我们在模型定义中明确确立了规范的级联删除约束：

![Dify 风格三层知识库树状解耦模型]({{ '/assets/images/dify-knowledge-hierarchy.png' | relative_url }})

```python
# server/app/models/knowledge.py (精简示意)
class KnowledgeBaseORM(Base, TimestampMixin):
    __tablename__ = "knowledge_bases"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    embedding_model: Mapped[str] = mapped_column(String(50), default="text-embedding-3-small")
    dimension: Mapped[int] = mapped_column(Integer, default=1536)
    
    # 严格的 1:N 树状级联约束，物理层杜绝孤儿记录
    documents: Mapped[list["DocumentORM"]] = relationship(
        "DocumentORM", back_populates="knowledge_base", cascade="all, delete-orphan", passive_deletes=True
    )
```

### 2. 向量存储方案的轻重权衡 (Trade-offs)
- **我提出的极简产品诉求**：业界的重型标准方案通常依赖 Docker 拉起独立的专用向量数据库（如 Milvus、Qdrant），或深度绑定 PostgreSQL 的 `pgvector` 扩展。但这违背了 PatchCat “零门槛免配置、纯本地开箱即用”的设计初衷 —— 我们绝不希望新手为了试用编排器，必须先在本地费劲拉起几个 G 的 Docker 容器。
- **AI 搭档提出的自适应解耦方案**：经过权衡，我们决定将后端设计为**双模自适应架构**：
  - **本地开发模式（默认）**：直接使用零配置的单文件 SQLite。向量切片在存入数据库时序列化为紧凑的 JSON 浮点数组，检索时由服务在 Python 进程内直接进行向量点积余弦计算，毫秒级响应；
  - **生产环境模式**：保留面向接口编程的契约，未来只需在环境变量中切换连接串，即可平滑切换至 PostgreSQL + `pgvector` 扩展，兼顾极致轻量与工业演进。

---

## 三、 后端底层引擎落地：分块、清洗与向量检索

确立了模型之后，整个 RAG 后端核心可以凝练为三大关键步骤：清洗、分块与相似度检索。

### 1. ETL 文本预清洗（借鉴成熟工业级清洗规则）
很多初学者容易忽视文本清洗，认为把原汁原味的文件直接塞进分块器即可。但现实中，文档往往充斥着 Windows 与 Unix 不同的换行符（`\r\n` vs `\n`）、排版遗留的连续 4~5 个无意义换行、以及复制粘贴带来的制表符（`\t`）和 Unicode 不间断空格。

这些噪音不仅严重稀释向量相似度的计算精度，还会大量浪费 Embedding 模型的 Token。我们借鉴了 Dify 的清洗规范，编写了简单而高效的清洗器：

```python
# server/app/services/rag/cleaner.py (核心规则剖析)
def clean_document_text(text: str) -> str:
    # 1. 统一所有换行符为标准 LF (\n)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # 2. 将 3 个及以上的连续换行压缩为 2 个换行（保持自然的段落分界）
    text = re.sub(r"\n{3,}", "\n\n", text)
    # 3. 压缩单行内无意义的制表符与多余空格
    text = text.replace("\t", " ")
    return text.strip()
```

### 2. 带重叠的滑动窗口分块器（Sliding Window Chunker）
在文本切片环节，我们实现了一个带有多级智能回退的**滑动窗口分块器**：
- **多级降级策略**：首先尝试按自然段落（`\n\n`）优先切分；如果单个段落依然超长，则降级为单换行（`\n`）切分；若依然超长，则按句号/问号/感叹号（`。！？.!?`）分句；最后才进行字符步长截断。
- **Overlap 边界重叠（50 字符）的精妙作用**：切片最忌讳“断章取义”。如果一句话恰好在分块边界被切成两半，比如前一块结尾是“该功能开启需注意”，下一块开头是“可能会导致数据丢失”，检索时两块都无法单独表达完整语义。通过在相邻切片之间保留 50 字符的尾部重叠，核心主谓宾信息被完整保留了下来。

同时，我们配套设计了 `POST /api/v1/preview-chunks` 接口，让前端能在用户上传文本时，零副作用地在内存中实时展示切片数量与 Token 分布预览。

![带重叠的滑动窗口分块器与边界保护机制]({{ '/assets/images/sliding-window-chunker.png' | relative_url }})

### 3. 余弦相似度检索与引文格式化（坦承目前的理解状态）
在切片被嵌入模型转化为向量之后，检索器负责在用户提问时找出最相关的段落。

**坦白讲，在实现这一块逻辑时，对于高维向量空间的空间几何映射、以及各色距离度量算法的深层次优劣，我自己目前其实还没有完全吃透，甚至可以说是刚摸到门道。但这正是与 AI 结对“干中学”的真实魅力所在 —— 我们不必等到把所有高深数学推导全部精通之后才敢动手，而是先按照业界成熟的标准余弦相似度算法把功能在工程上严密地跑通。等后续在复杂的真实业务场景中遇到检索召回率瓶颈时，再带着问题回过头来深挖数学调优！**

目前我们落地的检索器具备三个核心职责：
1. **边界安全计算**：通过向量单位模长归一化与除零保护，稳健计算用户问题与切片库之间的余弦相似度（Cosine Similarity）；
2. **Top-K 与阈值过滤**：先按 `score_threshold`（如 0.5）剔除完全不相关的噪点，再按得分由高到低截取前 `Top-K` 个切片；
3. **结构化引文输出**：将召回的切片自动拼接成标准 Markdown 格式（格式如 `### [Document: xxx.md (Similarity: 0.88)]`），并自动递增对应切片的 `hit_count` 命中计数，为后续的热点内容追踪沉淀数据。

---

## 四、 前端画布【知识库检索节点】设计

当后端的检索能力就绪后，我们在前端可视化画布中完成了对等的核心扩充 —— 正式注册全新的 <strong>【知识库检索节点 (Knowledge Node)】</strong>：

1. **视觉层级与青蓝（Cyan）色彩语义**：  
   为了与原有的输入节点（绿色）、提示词模板节点（紫色）、大模型推理节点（蓝色）和代码转换节点（黄色）形成清晰的视觉层级区分，该节点采用了象征沉稳与数据底座的**清爽科技青蓝（Cyan）**配色，并配备了数据库专属矢量图标；
2. **严格的插桩连接约束**：  
   - **左侧 `in` 输入桩**：用于接收上游传递的用户提问或动态插槽变量；
   - **右侧 `context` 输出桩**：用于将检索出的结构化引文规范化输出，干净地向后投喂给下游的 Prompt 或大模型；
3. **紧凑的数据流状态呈现**：  
   节点卡片内以精致的微型标签动态呈现当前选定的目标知识库名称、引用的 `query` 槽位以及预设的 `Top-K` 召回数量，让整条知识检索的数据流在画布上一目了然、所见即所得。

![前端画布【知识库检索节点】与端到端拓扑设计]({{ '/assets/images/knowledge-node-canvas-flow.png' | relative_url }})

---

## 五、 结语、源码与求指教

从最初只能在单画布上做简单的“输入 ➔ 提示词 ➔ 模型”三点一线拼接，到经历多流程抽屉改造，再到今天研读 Dify 架构后把三层数据模型、滑动分块与真实向量检索打通，PatchCat 正一步一个脚印地向着更加实用、严谨的编排工具演进。

这期间最大的感悟在于：**学习优秀开源项目最好的方式绝不是停留在看文章和死记概念，而是在 AI 搭档的协助下，把它的核心骨架在自己的代码库里一行行写出来、跑起来。** 遇到不懂的数学和底层机制，坦然承认“自己还在补课”，先通过工程手段跑通端到端闭环，再带着运行反馈去逐层消化。

目前 PatchCat 的全部前端与后端代码均已开源在 GitHub 上：
- **项目仓库**：[https://github.com/GuoBug/PatchCat](https://github.com/GuoBug/PatchCat)

坦白说，由于个人水平与精力和有限，当前的代码实现一定还存在不少稚嫩与欠考虑的地方。非常诚恳地欢迎各位前端专家、资深后端架构师与算法同行前来检阅代码、指出不足、交流探讨！
