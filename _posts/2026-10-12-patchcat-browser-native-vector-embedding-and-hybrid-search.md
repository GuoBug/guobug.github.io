---
layout: post
title: "PatchCat 工程复盘：纯前端端侧向量嵌入与三模混合检索（开源系列 24）"
title_en: "PatchCat Engineering Notes: Browser-Native Multi-Provider Vector Embedding and Tri-Modal Hybrid Search"
date: 2026-10-12 10:00:00 +0800
categories: [AI, Architecture, Engineering]
pub_tag: "Browser-Native Vector Embedding & Hybrid RAG"
math: true
read_time: "18 MIN READ"
summary: "PatchCat 是一个纯浏览器运行的 AI 工作流编排工具。此前，前端检索主要依赖字面重合度打分，遇到同义表达时容易漏检。本文记录一次端侧检索改造：直接对接硅基流动、Ollama 和 OpenAI 的 Embedding 接口，不引入大型模型权重，也不修改 CSP；使用 TypedArray 建立全内存向量索引，并处理 RRF 排名与相似度阈值的兼容、向量维度失效和三级降级等问题。最后讨论浏览器内存占用与 API 调用成本。"
summary_en: "PatchCat is a browser-based AI workflow orchestrator. Previously, client-side retrieval relied on lexical overlap heuristics and struggled with synonym queries. This article documents browser-native multi-provider embeddings and tri-modal hybrid search without CSP changes or large model weights. It covers FlatVectorIndex, RRF ranking and similarity threshold decoupling, dimension invalidation fingerprints, three-tier degradation, browser memory limits, and API token costs."
tags: [AI Workflow Orchestration, Vector Embedding, Hybrid Search, BM25, Reciprocal Rank Fusion, IndexedDB, Local-First, PatchCat]
series: "PatchCat · AI Prompt Flow Orchestrator"
---

> 项目开源地址：[GitHub - PatchCat](https://github.com/GuoBug/PatchCat)
>
> 在线体验：[PatchCat](https://guobug.github.io/PatchCat/)
>
> 往期回顾：
>
> 📖 [开源系列 23：用 Web Crypto API 加密本地 API Key]({{ '/posts/2026/10/10/ai-prompt-orchestrator-web-crypto-vault-and-zero-plaintext/' | relative_url }})
>
> 📖 [开源系列 22：纯前端实现 BM25 倒排索引与 RRF 排名融合]({{ '/posts/2026/10/06/ai-prompt-orchestrator-zero-dependency-bm25-and-rrf/' | relative_url }})
>
> 📖 [开源系列 21：Flow Preflight 语法静态分析与画布连线检查]({{ '/posts/2026/10/03/ai-prompt-orchestrator-flow-preflight-lint-and-simulation/' | relative_url }})
>
> 📖 [开源系列 20：模型级联路由与失败回退]({{ '/posts/2026/10/02/ai-prompt-orchestrator-cheap-first-model-routing-and-cascade-fallback/' | relative_url }})
>
> 📖 [开源系列 19：Agent 重复调用检测与熔断]({{ '/posts/2026/10/01/ai-prompt-orchestrator-agent-deadlock-and-circuit-breaker/' | relative_url }})
>
> 📖 [开源系列 18：DAG 检查点与断点续跑]({{ '/posts/2026/09/30/ai-prompt-orchestrator-dag-checkpoint-and-reverse-bfs/' | relative_url }})
>
> 📖 [开源系列 17：上下文窗口裁剪与原子更新]({{ '/posts/2026/09/29/ai-prompt-orchestrator-context-engineering-dual-anchor-pruning/' | relative_url }})
>
> 📖 [开源系列 16：架构清理与统计检验]({{ '/posts/2026/09/26/ai-prompt-orchestrator-architectural-purity-and-mcnemar-eval/' | relative_url }})

---

在 PatchCat 这样的纯前端 AI 工作流工具里，检索一直有个实际问题：BM25 能处理关键词匹配，却很难识别表达不同、意思相近的查询。把检索搬到服务端可以解决其中一部分问题，但也意味着额外的部署和维护成本。

开源系列 22 已经实现了 BM25 倒排索引和 Reciprocal Rank Fusion（RRF）排名融合。这套方案对错误码、专有名词等具有明确字面特征的查询效果不错，但如果用户问的是另一种说法，检索结果就可能完全不同。

当时，本地存储适配器中的 Dense 通道还不是真正的向量检索。为了让没有配置向量服务的工作流也能运行，我们用滑动窗口中的字词重合度估算相似度，并设置了一个常数兜底。这能给结果打分，却无法真正理解同义表达。

这个问题在后续的读者反馈和测试中暴露出来。因此，这次没有继续给旧算法添加匹配规则，而是直接接入 Embedding 服务，让纯前端模式也能进行真正的向量检索。

实现上，我们选择调用硅基流动、Ollama 和 OpenAI 的 Embedding 接口，在浏览器内存中建立连续数组索引，不下载模型权重。与此同时，还要解决新旧评分的兼容问题，以及多家服务商的模型切换可能造成的向量失效。

![PatchCat Browser-Native Vector Hybrid Search Cover Impasto]({{ '/assets/images/cover-patchcat-browser-native-vector-search.jpg' | relative_url }})

## 一、旧版 Dense 通道的问题

知识库里的文档怎么写，和用户实际怎么提问，经常对不上。

例如，用户输入“MacBook 崩溃卡死”，知识库里对应的标题却是“苹果笔记本电脑系统故障与无响应处理”。两者表达的是同一件事，但字面重合度很低，单靠 BM25 很可能检索不到目标文档。

旧版本地存储适配器中的 Dense 通道使用了下面这套启发式公式：

```typescript
const similarity =
  terms.size > 0
    ? Math.min(0.96, 0.45 + (termMatches / Math.max(1, terms.size)) * 0.35 + charOverlapRatio * 0.16)
    : 0.75;
```

核心问题在于：即使没有任何字面匹配，公式也会给结果一个 `0.45` 的基础分。这个分数看起来不低，却不能说明两段文本在语义上有多接近。

作为临时降级方案，它可以保证旧检索流程继续运行；但如果把它当作真正的 Dense Retrieval，就会产生误导。继续调整字词重合度的权重，也解决不了同义表达之间缺乏语义联系的问题。

因此，这次改造直接引入 Dense Vector Embedding，通过向量之间的相似度进行检索，而不是继续调整原来的启发式公式。

## 二、为什么选择远程 Embedding

在浏览器里实现向量检索，大致有两种选择：直接运行本地模型，或者调用外部 Embedding 接口。

本地推理的好处是，模型下载完成后可以不依赖远程推理服务。但如果使用 WebAssembly 和 Transformers.js，就需要考虑模型权重下载、初始化时间和运行时内存。即使是较小的嵌入模型，权重文件也可能达到 40MB 至 100MB。首次加载的等待时间和内存占用，对移动设备尤其不友好。

PatchCat 已经有现成的服务端 Embedding 管道，FastAPI 适配器支持 SiliconFlow、Ollama、OpenAI 和 pgvector。前端也已经实现 BYOK（Bring Your Own Key），用户可以配置自己的服务商和凭据。

浏览器侧的基础条件也已经具备：

1. 现有 CSP 白名单允许访问本地 Ollama（`http://localhost:*`）、硅基流动国内托管端点（`api.siliconflow.cn`）和 OpenAI 官方地址。
2. 用户使用相关服务时，通常已经配置了对应的 API 凭据。
3. 向量生成可以通过现有网络接口完成，不需要将模型权重下载到浏览器。

综合这些条件，这次选择复用现有服务商接口，没有再引入 WASM 推理，也不需要为此修改 CSP。

需要注意的是，浏览器调用远程 Embedding API 并不等于完全离线运行。浏览器负责请求、存储和检索，向量生成仍然依赖配置的服务。使用本地 Ollama 时，还要看服务的监听地址和 CORS 配置。CSP 允许发起请求，不代表请求一定能够成功。

这次改造的目标很明确：**保留纯前端、免部署的使用方式，同时让 Dense 通道具备真正的语义检索能力。**

整个开发过程使用了 AI 辅助编程，我主要从产品定位和现有架构出发，明确免部署、零额外环境依赖和 BYOK 这几个约束，再与 AI 协作者一起检查实现细节。

代码审查时，主要发现了三个需要处理的问题：

- **评分兼容。** RRF 融合的是排名，但下游工作流还会根据 `similarity` 分数过滤结果。替换 Dense 算法后，不能只保证排序正常。
- **网络失败。** 浏览器直连本地 Ollama 可能被 CORS 拦截，CSP 放行并不能解决这个问题。
- **向量失效。** 不同服务商或模型可能输出不同维度的向量。切换配置后，旧向量不能直接沿用；即使维度相同，不同模型的向量空间也未必兼容。

![PatchCat Tri-Modal Hybrid Retrieval Architecture SVG]({{ '/assets/images/flowchart-browser-native-tri-modal-rag.svg' | relative_url }})

## 三、三模检索的实现

这次改造涉及三个主要部分：统一的 Embedding 客户端、内存中的连续向量索引，以及带有失效检查的 IndexedDB 存储。

### 1. 统一多服务商接口

`BrowserEmbeddingClient` 负责处理不同提供商的请求差异，对上层提供统一的调用方式。

批量 Embedding 请求有个容易忽略的细节：响应中的向量不一定按照输入顺序排列。如果直接将返回数组与原始文本逐项对应，就可能把错误的向量分配给知识分块。

因此，客户端会先按照返回项的 `index` 排序：

```typescript
data.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
```

这一步虽然简单，却直接关系到检索结果是否正确。文本和向量一旦错位，后面的计算即使没有报错，返回的也可能是错误文档。

拿到向量后，客户端还会执行 L2 范数归一化，将向量模长调整为 1：

$$
\|\vec{v}\| = \sqrt{\sum_{i=1}^{d} v_i^2} = 1
$$

对于已经归一化的两个向量，余弦相似度可以直接用点积计算：

$$
\text{CosineSimilarity}(\vec{u}, \vec{v})
= \vec{u} \cdot \vec{v}
= \sum_{i=1}^{d} u_i v_i
$$

这样，检索时不必反复计算向量模长，只需遍历数组并累加乘积。

### 2. 使用 Float32Array 建立向量索引

对于几百到几千个知识分块的知识库，直接线性扫描是一个足够简单的起点，没必要一开始就引入复杂的近似最近邻索引。

以 HNSW 为例，它通过分层可导航小世界图加速近邻搜索，但也需要维护图结构和节点关系。在 JavaScript 环境中，这些额外的对象和引用会增加内存管理开销。对于当前的数据规模，是否值得引入这部分复杂度，还需要看实际测量结果。

因此，这次实现了 `FlatVectorIndex`，将所有向量按固定维度存入一个连续的 `Float32Array`：

```typescript
export class FlatVectorIndex {
  private buffer: Float32Array;
  private chunkIds: string[] = [];
  private dimension: number;
  private count: number = 0;

  constructor(dimension: number, initialCapacity = 256) {
    this.dimension = dimension;
    this.buffer = new Float32Array(initialCapacity * dimension);
  }

  public add(chunkId: string, vector: Float32Array): void {
    if (vector.length !== this.dimension) {
      throw new Error(`Dimension mismatch: expected ${this.dimension}, got ${vector.length}`);
    }
    this.ensureCapacity(this.count + 1);
    this.buffer.set(vector, this.count * this.dimension);
    this.chunkIds.push(chunkId);
    this.count++;
  }
}
```

这段实现主要考虑了两件事。

首先，所有向量共用一个连续的数值缓冲区，不需要为每条向量单独维护一个数组对象。这样可以减少对象管理开销，也让扫描过程能够连续访问数值数据。

其次，`add()` 会检查输入向量的维度。长度不匹配时立即抛出异常，避免错误数据进入索引后才在检索阶段暴露问题。

一次 Top-K 检索需要遍历所有候选向量，计算量与分块数和向量维度的乘积成正比。当前还没有进行严格的耗时压测，因此不能给出具体的性能结论。从计算路径看，千级分块规模下，主要成本很可能仍然是 Embedding 请求的网络往返，而不是本地点积计算，这一点还需要基准测试验证。

删除分块时，索引使用末尾元素换位覆盖（Swap-with-last），避免整体移动中间元素。不过，这种做法也意味着删除后元素顺序可能发生变化，调用方不能依赖索引内部的稳定顺序。

这套设计针对的是目前的知识库规模，并不意味着线性扫描适用于所有规模。数据量继续增长后，仍然需要重新评估索引方案。

### 3. IndexedDB v6 与向量失效检查

内存索引负责检索，IndexedDB 则负责持久化。这次将数据库升级到版本 6，新增 `vector_embeddings` 对象仓库。

持久化向量最需要注意的是模型切换。

例如，用户最初使用硅基流动的 1024 维模型，后来改成 OpenAI 的 1536 维模型，或者切换到输出 768 维向量的 Ollama 模型。旧向量即使还保存在 IndexedDB 中，也不能直接与新模型生成的查询向量比较。

因此，每条向量记录都会保存服务商、模型名称和向量维度：

```typescript
export interface VectorEmbeddingRecord {
  chunkId: string;
  kbId: string;
  vector: Float32Array;
  provider: 'siliconflow' | 'openai' | 'ollama' | 'custom';
  model: string;
  dimension: number;
  createdAt: number;
}
```

检索时，系统会将记录中的服务商、模型和维度与当前配置进行比对。只要其中一项不匹配，就把对应向量视为失效，不让它参与当前的向量检索。

这里不能只检查维度。两个模型即使都输出 1024 维向量，其向量空间也不一定兼容。记录模型信息，就是为了避免这种情况下继续使用旧数据。

## 四、RRF 排名与 similarity 分数不能混为一谈

这次改造中，比点积计算更需要仔细处理的是新旧评分之间的兼容问题。

RRF 会融合不同检索通道的排名，但 PatchCat 对外提供的 `similarity` 维持由 BM25 与 Dense 两路原始分数加权计算的物理相似度：

$$
\text{similarity}
= \min(0.98, \max(0.1,
\alpha \cdot \text{bm25Norm}
+ \beta \cdot \text{denseScore}))
$$

这两个环节的职责不同。RRF 决定候选结果如何排序，而 `similarity` 还会影响后续节点的过滤行为。

很多已有工作流配置了 `scoreThreshold`，用来过滤低分结果。旧版 Dense 公式带有 `0.45` 的基础分，替换成真实余弦相似度后，分数分布可能发生变化。如果直接把新分数代入原来的加权公式，即使排名有所改善，也可能让原先能够通过阈值的结果被过滤掉。

因此，这次没有把不同用途的分数混在一起，而是明确区分了以下字段：

| 分数字段 | 取值区间 | 用途 |
| :--- | :--- | :--- |
| `dense_score` | $[0, 1]$ | 真实的语义向量余弦相似度 |
| `bm25_score` | $[0, +\infty)$ | 稀疏词法相关度 |
| `rrf_score` | $(0, +\infty)$ | 融合候选结果的排名 |
| `similarity` | $[0.1, 0.98]$ | 兼容历史字段，供下游阈值过滤使用 |

`dense_score` 和 `bm25_score` 保留各自的评分含义，`rrf_score` 用于排名融合，`similarity` 则继续承担历史工作流依赖的过滤职责。

这样做的目的不是让几个分数看起来更整齐，而是避免升级检索算法时，连带改变已有工作流对分数的理解。

![PatchCat Vector Degradation Airbag Illustration]({{ '/assets/images/intext-patchcat-vector-degradation-airbag.jpg' | relative_url }})

### 三级降级机制

向量服务并不是始终可用的。用户可能没有配置模型，API 凭据可能失效，网络请求也可能失败。因此，真实向量检索之外，还需要保留可用的降级路径。

**L1：真实向量检索**

向量服务正常响应时，使用真实 Embedding 和余弦点积计算语义相似度，不再向 Dense 分数叠加人工常数。

**L2：旧版启发式降级**

没有配置向量模型、凭据过期或网络请求失败时，退回原有的 `0.45` 基础分公式。保留这条路径，是为了让向量服务不可用时，现有工作流仍能沿用原来的评分行为。

**L3：纯词法检索**

当向量通道不可用时，仍然可以依靠 BM25 返回词法匹配结果。

本地 Ollama 还有一个特殊情况：浏览器请求可能被 CORS 策略拦截。适配器会捕获请求异常，在界面显示操作提示，引导用户检查服务端跨域配置，并切换到 L2 降级模式。

检索结果还会通过 `vector_status` 报告向量通道的运行状态。用户可以据此判断当前使用的是真实向量检索，还是已经退回启发式方案，而不必只根据搜索结果猜测。

## 五、对照测试：同义表达与精确标识符

向量能否生成、索引能否运行，只能说明基础流程打通了。检索改造最终还是要看实际查询能否找到目标内容。

这次选取了两类技术运维查询：一类是字面表达不同、但语义相近的自然语言查询；另一类是需要精确匹配的技术标识符。

### 测试 A：同义表达

查询：

> MacBook 崩溃卡死

目标分块：

> 苹果笔记本电脑系统故障与无响应处理操作手册……

结果对比：

- 旧版 L2 启发式通道：未命中。词法重叠度为 0，目标分块无法进入候选池。
- 新版 L1 真实向量通道：Top-1 命中。

### 测试 B：精确标识符

查询：

> DAG_CYCLE_DETECTED

目标分块：

> 拓扑环路异常抛出规范与 Kahn 算法熔断保护机制……

结果对比：

- 旧版 L2 启发式通道：BM25 直接命中，排名 Top-1。
- 新版 L1 真实向量通道：BM25 与稠密检索共同作用，排名 Top-1。

这两个例子对应了两种不同的检索需求：向量检索补足字面表达的差异，BM25 则继续处理错误码和技术标识符。两者结合，比直接用向量检索替换 BM25 更适合 PatchCat 的使用场景。

不过，这组结果需要明确它的测试边界。

目前，相关对照以契约测试的形式保存在 `tests/vector-search-engine.node.test.ts` 中。查询与分块使用的是人工构造的模拟向量，用来验证向量通道启用时能够召回目标、降级时遵循预期行为，并不是对真实 Embedding 模型检索效果的测量。

因此，这些测试不能用来推导真实模型的 Top-1 命中率。实际召回表现还取决于所选模型、知识库内容和用户查询，需要另外设计评测数据集进行验证。

## 六、纯前端方案能承载多大的知识库？

检索链路跑通之后，还需要考虑浏览器的内存和网络成本。

向量缓冲区的内存占用可以直接计算：每个分块需要 `维度 × 4 字节`。

以 1024 维模型为例：

- 1,000 个分块：约 4MB。
- 5,000 个分块：约 20MB。

如果使用 1536 维模型，5,000 个分块的向量数据约占 30MB。

这些数字只计算了向量缓冲区，不包括分块文本、BM25 倒排索引，以及动态扩容时可能出现的临时缓冲区。因此，实际内存占用会更高。

对于桌面浏览器里的中小型知识库，这个量级通常可以接受。但数据增长到数万分块后，内存扩容、数据处理和垃圾回收都可能影响页面交互。届时应重新评估检索架构，考虑由服务端向量引擎承担检索任务，而不是一味扩大前端索引。

另一个成本是 Embedding API 的调用。

不在浏览器里运行模型，省掉了模型权重下载和本地推理的负担，但向量生成仍然需要发送文本请求。用户导入长文档时，前端需要分批调用服务商接口，消耗网络带宽和相应的 API 额度。

目前，知识库面板在重建向量索引时会显示“已完成 / 总数”的进度，单次请求也设置了超时保护。不过，用户还不能手动取消正在执行的重建任务，这是后续需要完善的地方。

最后是凭据和离线使用的问题。

PatchCat 使用主口令暗室保护本地 API 凭据。暗室锁定时，前端无法读取服务商凭据，向量请求也就无法正常发起。系统会切换到降级通道，并显示当前状态。

所以，这套方案适合希望免部署、轻量使用，并且愿意配置 Embedding 服务的用户。如果要求完全离线，或者知识库已经达到数万分块，就需要考虑其他实现路线。

## 七、总结与下一步

这次改造把 PatchCat 原有的启发式 Dense 通道升级为真实向量检索，同时保留了 BM25 的词法匹配能力。

实现上没有引入大型模型权重，也没有增加新的服务端依赖。`BrowserEmbeddingClient` 负责对接不同服务商，`FlatVectorIndex` 负责内存中的连续数组扫描，IndexedDB 则保存向量及其服务商、模型和维度信息。

改造过程中，真正需要花心思处理的并不只是向量计算。新分数接入后，旧版 `similarity` 的含义、下游阈值的兼容，以及服务不可用时如何降级，都必须一起考虑。否则，检索本身可能工作正常，却会改变已有工作流的行为。

目前，全工程 565 项自动化测试已全部通过，覆盖维度校验、乱序回排和降级流转等场景。

接下来，计划继续完善 DAG 状态机，在画布中增加独立的会话记忆节点，让上下文变量可以被显式编排，并支持工作流拓扑的版本快照与比对。

对 PatchCat 这样的本地优先工具来说，我更关心的是每项功能接入之后，能否清楚地说明它的适用范围、失败时的处理方式，以及它会怎样影响已有功能。浏览器有自己的资源限制，纯前端也不可能解决所有问题。把这些约束纳入设计，远比单纯增加功能数量更实际。

---

> 下一篇：
>
> 📖 [开源系列 25：从隐式注入到画布显式原语——MemoryNode 架构设计与确定性会话调度]({{ '/posts/2026/10/13/patchcat-memory-node-canvas-visual-primitive/' | relative_url }})

---

> **关于作者**
>
> **郭强 (GuoBug)**，Product Engineer，做平台工程也做业务增长。目前主要在折腾 AI 工作流编排、DAG 状态机与确定性系统架构。
>
> 开源项目与主页：[https://github.com/GuoBug](https://github.com/GuoBug) · [https://guobug.github.io](https://guobug.github.io)
>
> 欢迎就工作流引擎架构、拓扑调度和低门槛开发体验交流指教。
