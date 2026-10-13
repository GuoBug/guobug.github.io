---
layout: post
title: "PatchCat 工程复盘：纯前端端侧向量嵌入与三模混合检索（开源系列 24）"
title_en: "PatchCat Engineering Notes: Browser-Native Multi-Provider Vector Embedding and Tri-Modal Hybrid Search"
date: 2026-10-12 10:00:00 +0800
categories: [AI, Architecture, Engineering]
pub_tag: "Browser-Native Vector Embedding & Hybrid RAG"
math: true
read_time: "18 MIN READ"
summary: "PatchCat 是一个纯浏览器运行的 AI 工作流编排工具。此前，前端检索主要依赖字面重合度打分，遇到同义表达时经常无法命中。本文记录一次端侧检索改造：不引入大型模型权重，也不修改 CSP，直接对接硅基流动、Ollama 和 OpenAI 的嵌入接口；使用 TypedArray 建立全内存向量索引，并通过代码审查处理 RRF 排序与相似度阈值之间的关系、向量维度失效和三级降级。最后讨论这种实现的内存上限与网络成本。"
summary_en: "PatchCat is a browser-based AI workflow orchestrator. Previously, client-side retrieval relied on lexical overlap heuristics and struggled with synonym queries. This article documents the implementation of browser-native multi-provider embeddings and tri-modal hybrid search without CSP changes or large model weights. It covers FlatVectorIndex, RRF ranking and similarity threshold decoupling, dimension invalidation fingerprints, three-tier degradation, browser memory limits, and API token costs."
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

在浏览器里做 AI 工作流编排（AI Workflow Orchestration），RAG 检索一直有个绕不开的问题：如果把检索放在服务端，就得增加部署和维护成本；如果坚持纯前端运行，又很难只靠字符串匹配做好语义检索。

在开源系列 22 中，我们已经用 TypeScript 实现了 BM25 倒排索引和 Reciprocal Rank Fusion（RRF）排名融合。对于错误码、专有名词这类有明确字面特征的查询，BM25 足够好用。但用户不会总是按照文档中的原话提问。换一种说法，检索结果就可能完全不同。

当时，为了让没有配置向量服务的工作流也能正常运行，本地存储适配器里的 Dense 通道采用了滑动窗口字词重合度打分，再加上一个常数兜底。它能给结果分配分数，却不具备真正的语义泛化能力。这个问题很快被读者和测试指出。

所以，这次要解决的不是再给旧算法增加几条匹配规则，而是让纯前端模式真正具备向量检索能力。

实现上，我们选择直接调用已有的 Embedding 服务，在浏览器内存中建立连续数组索引，不引入几十兆的模型权重。与此同时，还需要处理多家服务商的向量维度差异，以及真实向量分数接入后可能影响已有工作流的问题。

![PatchCat Browser-Native Vector Hybrid Search Cover Impasto]({{ '/assets/images/cover-patchcat-browser-native-vector-search.jpg' | relative_url }})

## 一、先解决一个问题：旧版 Dense 并不是真正的向量检索

知识库里的文档怎么写，和用户会怎么问，往往不是一回事。

例如，用户排障时输入“MacBook 崩溃卡死”，知识库中对应的标题却是“苹果笔记本电脑系统故障与无响应处理”。两句话表达的是同一件事，但几乎没有可以直接匹配的字面内容，传统 BM25 检索很可能给出零分。

旧版本地存储适配器中的 Dense 通道采用了下面这套启发式公式：

```typescript
const similarity =
  terms.size > 0
    ? Math.min(0.96, 0.45 + (termMatches / Math.max(1, terms.size)) * 0.35 + charOverlapRatio * 0.16)
    : 0.75;
```

问题就在这里。

即使没有任何字面匹配，公式也会通过 `0.45` 的基础分给结果打分。没有匹配时，它仍然能产生一个看起来不低的相似度，但这个数字并不能说明两段文本在语义上有多接近。

这套实现可以作为临时的降级方案，却不能代替真正的 Dense Retrieval。继续调整重合度权重，也解决不了同义表达之间缺少语义联系的问题。

因此，这次改造引入真正的向量嵌入（Dense Vector Embedding），让检索可以比较文本在向量空间中的距离，而不只是比较字面重合度。

## 二、为什么不直接在浏览器里跑一个模型？

要在纯前端实现向量检索，大致有两条路线：一条是在浏览器里运行本地模型，另一条是调用外部 Embedding 接口。

第一条路线的优势很明确：模型下载完成后，可以不依赖远程推理服务。但如果采用 WebAssembly 和 Transformers.js，就必须同时考虑模型权重下载、初始化时间和运行时内存。

即使选择较小的嵌入模型，权重文件也可能达到 40MB 至 100MB。首次下载、模型初始化和内存占用都会影响使用体验，移动设备上的压力尤其明显。对于一个希望打开网页就能使用的轻量工具，这笔成本并不容易忽略。

PatchCat 的服务端其实已经有现成的 Embedding 管道：FastAPI 适配器支持 SiliconFlow、Ollama、OpenAI 和 pgvector。前端也已经有 BYOK（Bring Your Own Key）机制，用户可以配置自己使用的服务商和凭据。

再看浏览器侧的条件：

1. 现有 CSP 白名单已经允许访问本地 Ollama（`http://localhost:*`）、硅基流动国内托管端点（`api.siliconflow.cn`）和 OpenAI 官方地址。
2. 用户使用相关服务时，通常已经配置了对应的 API 凭据。
3. 向量化任务可以通过现有网络接口完成，不需要把模型权重下载到浏览器。

因此，这次没有继续引入 WASM 推理，而是复用现有的服务商接口。这样既不需要修改 CSP，也不需要增加模型权重带来的下载和内存开销。

这里有一点需要说明：调用远程 Embedding API，并不等于完全离线运行。浏览器负责请求、存储和检索，向量生成仍然依赖所配置的服务。对于本地 Ollama，是否能够成功连接，还要看服务端监听地址和 CORS 配置。CSP 放行只代表浏览器策略允许尝试请求，并不保证请求一定成功。

这也是本次改造的实际定位：**不在浏览器里重新实现一套模型推理基础设施，而是在不增加部署负担的前提下，让纯前端模式具备真正的向量检索能力。**

整个开发过程使用了 AI 辅助编程，采用边写边学的方式推进。我主要从产品定位和现有架构出发，确定纯前端免部署、零额外环境依赖和 BYOK 体验这几个约束，再与 AI 协作者一起检查实现细节。

代码审查过程中，有三个问题值得单独处理：

- RRF 使用的是排名，而下游过滤依赖的是分数。替换 Dense 算法后，如果直接沿用旧分数的处理方式，可能破坏已有阈值。
- 浏览器直连本地 Ollama 可能遇到 CORS 拦截。即使 CSP 已经放行，也不能保证请求成功。
- 不同服务商或模型可能输出不同维度的向量。切换配置后，如果继续使用旧向量，点积计算就可能出现维度不匹配。

这些问题分别涉及评分兼容、网络失败处理和向量数据有效性，后面会逐一展开。

![PatchCat Tri-Modal Hybrid Retrieval Architecture SVG]({{ '/assets/images/flowchart-browser-native-tri-modal-rag.svg' | relative_url }})

## 三、纯前端三模检索怎么实现

这次实现主要涉及三个部分：多服务商 Embedding 客户端、内存中的连续向量索引，以及带有失效判断的 IndexedDB 存储。

### 1. 统一封装多服务商 Embedding 接口

`BrowserEmbeddingClient` 负责处理不同提供商之间的请求差异，对上层提供统一的调用方式。

其中有一个容易忽略的细节：批量 Embedding 请求返回的数据，不一定按照输入顺序排列。如果直接把响应数组与原始文本数组逐项对应，就有可能把错误的向量分配给知识分块。

因此，客户端会先按返回项的 `index` 排序：

```typescript
data.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
```

这一步看起来很小，但一旦文本和向量发生错位，后续检索即使正常运行，也只会返回错误结果。

拿到向量后，客户端还会执行 L2 范数归一化，使向量模长为 1：

$$
\|\vec{v}\| = \sqrt{\sum_{i=1}^{d} v_i^2} = 1
$$

两个向量都完成归一化后，余弦相似度就可以直接通过点积计算：

$$
\text{CosineSimilarity}(\vec{u}, \vec{v})
= \vec{u} \cdot \vec{v}
= \sum_{i=1}^{d} u_i v_i
$$

这样，检索阶段不必反复计算向量模长，只需要遍历数组并累加乘积即可。

### 2. 用一个连续的 Float32Array 存放向量

对于几百到几千个知识分块的端侧知识库，直接线性扫描通常比引入复杂的近似最近邻索引更合适。

例如 HNSW 这样的分层可导航小世界图，适合在更大规模的数据集中加速近邻搜索，但它也需要维护图结构和节点关系。在 JavaScript 环境中，额外的对象和引用会增加内存管理与垃圾回收的负担。对于当前规模，未必值得承担这部分复杂度。

因此，我们实现了 `FlatVectorIndex`，把所有向量按固定维度依次存进一个连续的 `Float32Array`：

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

这里有两个关键点。

首先，所有向量共用一个连续的数值缓冲区，而不是为每条向量单独维护一组数组对象。这样可以减少对象管理开销，并让扫描过程访问连续的内存区域。

其次，`add()` 会检查向量维度。如果输入向量的长度与索引维度不一致，就直接抛出异常，而不是把错误留到后续计算阶段。

在一次 Top-K 检索中，线性扫描的计算量是“分块数 × 维度”次乘加。我们目前还没有做严格的耗时压测，只能给出定性判断：在千级分块规模下，这部分本地计算远小于一次 Embedding 接口的网络往返，检索延迟的主要来源是网络而不是点积。删除分块时，则使用末尾元素换位覆盖（Swap-with-last），避免为了删除中间元素而整体移动数组，删除操作的开销为常数复杂度。

这组实现适用于当前的知识库规模。它并不意味着线性扫描在任何规模下都比向量索引更快；当数据量继续增长时，仍然需要重新评估索引策略。

### 3. IndexedDB v6 与向量失效指纹

向量索引解决了内存中的检索问题，但向量数据还需要持久化。此次改造将 IndexedDB 升级到版本 6，并新增 `vector_embeddings` 对象仓库。

持久化时，一个必须处理的问题是模型切换。

例如，用户最初使用硅基流动的 1024 维模型，后来改成 OpenAI 的 1536 维模型，或者切换到输出 768 维向量的 Ollama 模型。即使旧向量仍然保存在 IndexedDB 中，也不能直接拿来与新模型生成的查询向量比较。

为此，每条记录都保存服务商、模型名称和向量维度：

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

检索时，系统会检查当前知识库配置与记录中的服务商、模型和维度是否一致。只要其中一项不匹配，就将该记录对应的向量视为失效，并跳过这条记录的向量检索。

这套判断的目的不只是避免数组越界，还包括防止旧模型生成的向量继续参与新模型的检索。否则，即使向量维度碰巧相同，不同模型的向量空间也未必可以直接比较。

## 四、RRF 排名不等于相似度：如何兼容已有工作流

这次改造中，最需要仔细处理的不是点积计算，而是新旧分数之间的兼容问题。

最初有一种看似合理的判断：RRF 会把不同检索通道的排名融合起来，因此只要排序正常，把旧的启发式 Dense 分数换成真实余弦相似度，就不会影响最终结果。

但检查现有代码后发现，事情没有这么简单。

RRF 确实负责融合不同通道的排名，可 PatchCat 对外提供的 `similarity` 并不是 RRF 排名分，而是由 BM25 和 Dense 两路原始分数加权得到：

$$
\text{similarity}
= \min(0.98, \max(0.1,
\alpha \cdot \text{bm25Norm}
+ \beta \cdot \text{denseScore}))
$$

这两个分数承担的职责不同。如果只关注最终排序，就容易忽略下游节点对 `similarity` 的依赖。

很多已有工作流都配置了 `scoreThreshold`，用来过滤低分结果。旧版 Dense 公式有 `0.45` 的基础分，替换为真实余弦相似度后，分数分布可能发生变化。如果直接把新分数代入旧的加权公式，原先调好的阈值就可能过滤掉更多结果。

换句话说，**检索排序可以升级，但不能因此悄悄改变已有工作流对分数的理解。**

![PatchCat Vector Degradation Airbag Illustration]({{ '/assets/images/intext-patchcat-vector-degradation-airbag.jpg' | relative_url }})

解决方法是将不同用途的分数明确分开：

| 分数字段 | 取值区间 | 用途 |
| :--- | :--- | :--- |
| `dense_score` | $[0, 1]$ | 真实的语义向量余弦相似度 |
| `bm25_score` | $[0, +\infty)$ | 稀疏词法相关度 |
| `rrf_score` | $(0, +\infty)$ | 融合候选结果的排名 |
| `similarity` | $[0.1, 0.98]$ | 兼容历史字段，供下游阈值过滤使用 |

其中，`dense_score` 和 `bm25_score` 保留各自的含义，`rrf_score` 用于排名融合，`similarity` 则继续承担历史工作流依赖的过滤分数。

这样，真实向量接入后就不必直接替换所有旧有的评分语义。

与此同时，检索逻辑也增加了三级降级处理。

**L1：真实向量检索。**

向量服务正常响应时，使用真实 Embedding 和余弦点积计算，不再给 Dense 分数叠加人工常数。

**L2：旧版启发式降级。**

用户没有配置向量模型、凭据过期或网络请求失败时，退回原有的 `0.45` 基础分公式。保留这条路径，是为了避免向量服务不可用时，现有工作流的分数分布突然发生变化。

**L3：纯词法检索。**

当向量通道不可用时，仍可依靠 BM25 返回词法匹配结果。

本地 Ollama 还有一个实际问题：浏览器请求可能被 CORS 策略拦截。适配器捕获异常后，会在界面显示操作提示，引导用户通过配置环境变量放行对应端口，并切换到 L2 降级模式。

同时，检索结果会通过 `vector_status` 明确报告向量通道的运行状态。这样，用户可以区分当前是在使用真实向量检索，还是已经退回启发式方案，而不必仅凭结果表现猜测出了什么问题。

## 五、对照测试：同义表达与精确标识符

改造是否有效，不能只看向量能否生成、索引能否运行，还得回到实际检索结果。

这次测试选取了两类技术运维查询：一类是字面表达不同、语义相近的自然语言查询；另一类是要求精确匹配的技术标识符。

**测试 A：同义表达**

查询：

> MacBook 崩溃卡死

目标分块：

> 苹果笔记本电脑系统故障与无响应处理操作手册……

结果对比如下：

- 旧版 L2 启发式通道：未命中。词法重叠度为 0，目标分块无法进入候选池。
- 新版 L1 真实向量通道：Top-1 命中。

**测试 B：精确标识符**

查询：

> DAG_CYCLE_DETECTED

目标分块：

> 拓扑环路异常抛出规范与 Kahn 算法熔断保护机制……

结果对比如下：

- 旧版 L2 启发式通道：BM25 直接命中，排名 Top-1。
- 新版 L1 真实向量通道：BM25 与稠密检索共同作用，排名 Top-1。

这组基线对照说明，在当前测试样本中，真实向量检索补上了同义表达场景下的召回能力，而 BM25 仍然能够处理精确标识符查询。

两种检索方式解决的是不同的问题。向量检索负责弥补字面表达差异，词法检索则继续发挥精确匹配的优势。将两者结合，比单纯用向量替换 BM25 更符合 PatchCat 的使用场景。

需要说明的是，这组对照目前以契约测试的形式固化在 `tests/vector-search-engine.node.test.ts` 中，查询与分块向量是人工构造的模拟向量，用来锁定“向量通道生效时能召回、降级时不能召回”的行为契约，而不是对真实 Embedding 模型效果的测量。真实模型下的召回表现取决于具体模型、知识库和查询，还需要单独评测，这里不能据此推导任何 Top-1 命中率。

## 六、纯前端方案的边界

这套实现跑通之后，还需要回答一个问题：什么规模的知识库适合留在浏览器里？

向量缓冲区的内存可以直接按数据结构估算：每个分块占用“维度 × 4 字节”。以 1024 维为例，1,000 个分块约 4MB，5,000 个分块约 20MB；如果使用 1536 维模型，5,000 个分块约 30MB。这还不包括分块文本、BM25 倒排索引和动态扩容时的临时缓冲。

这个量级对桌面浏览器通常可以接受，但并不意味着可以无限扩展。知识库增长到数万分块后，向量缓冲区的扩容、数据处理和垃圾回收都可能开始影响页面交互。对于这种规模，应该考虑把检索交给服务端向量引擎，而不是继续扩大前端索引。

另一个成本来自网络和 Token。

使用外部 Embedding API，省掉了本地模型的下载和推理负担，但向量生成并没有因此变成免费的本地操作。用户导入长文档时，前端仍然需要分批向服务商发送文本，消耗网络带宽以及相应的 API 额度。

为此，知识库面板在重建向量索引时会显示“已完成 / 总数”的进度，单次请求也设置了超时保护。目前还不支持用户中途手动取消重建任务，这是后续需要补上的体验缺口。

最后是凭据访问与离线限制。

PatchCat 使用主口令暗室保护本地 API 凭据。当暗室处于锁定状态时，前端无法读取服务商凭据，向量请求也就无法正常发起。此时系统会切换到降级通道，并明确显示当前状态。

因此，这套方案适合希望免部署、轻量使用，并且愿意自行配置 Embedding 服务的用户。如果要求完全离线，或者知识库规模已经达到数万分块，就需要考虑其他实现路线。

## 七、总结与下一步

这次改造把 PatchCat 原有的启发式 Dense 通道替换为真正的向量嵌入，同时保留了 BM25 的精确匹配能力。

实现上，没有引入大型模型权重，也没有增加新的服务端依赖。多服务商客户端负责生成向量，`FlatVectorIndex` 负责内存中的连续数组扫描，IndexedDB 则保存向量及其服务商、模型和维度信息。

更重要的是，这次改造不只涉及检索算法本身。真实向量接入后，旧版 `similarity` 的分数语义、下游阈值以及服务不可用时的行为，都需要一并处理。通过拆分评分字段、增加维度失效检查和三级降级机制，才算把这条检索链路真正接进了现有工作流。

目前，全工程 565 项自动化测试已全部通过，覆盖维度校验、乱序回排和降级流转等场景。

接下来，我们计划继续完善 DAG 状态机，在画布中增加独立的会话记忆节点，让上下文变量能够被显式编排，并支持工作流拓扑的版本快照与比对。

对于 PatchCat 这样的本地优先工具，我更在意的不是堆叠多少技术名词，而是每增加一项能力，都能说清楚它的适用范围、失败方式，以及与现有功能之间的关系。浏览器资源有限，纯前端方案也有边界；把这些边界处理好，才有可能让复杂的 AI 工作流稳定运行。

---

> 下一篇预告
>
> 📖 《从 0 到 1 打造 AI 提示流编排器：MemoryNode 画布显式原语与工作流版本快照实战（开源系列 25）》

---

> **关于作者**
>
> **郭强 (GuoBug)**，Product Engineer，做平台工程也做业务增长。目前主要在折腾 AI 工作流编排、DAG 状态机与确定性系统架构。
>
> 开源项目与主页：[https://github.com/GuoBug](https://github.com/GuoBug) · [https://guobug.github.io](https://guobug.github.io)
>
> 欢迎就工作流引擎架构、拓扑调度和低门槛开发体验交流指教。