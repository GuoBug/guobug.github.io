---
layout: post
title: "PatchCat 工程复盘：IndexedDB 工作流版本快照、拓扑规范化指纹与结构化 DAG Diff 实战（开源系列 26）"
title_en: "PatchCat Engineering Notes: IndexedDB Workflow Version Snapshots, Canonical Topological Hash, and Structural DAG Diff in Practice"
date: 2026-10-16 11:30:00 +0800
categories: [AI, Architecture, Engineering]
pub_tag: "Workflow Version Snapshots & Structural DAG Diff"
math: true
read_time: "19 MIN READ"
summary: "在纯浏览器端进行 AI 工作流编排时，画布缺乏版本快照与结构化比对会让开发者陷入改坏提示词无法回退的焦虑。本文复盘 PatchCat 工作流版本快照与结构化 DAG Diff 引擎的落地全过程：通过人机双向共创确立 30 版本硬配额、仅坐标变更默认折叠与可撤销回滚契约；剖析忽略布局抖动与运行时脏状态的 SHA-256 拓扑规范化指纹、基于 LCS 的字段级行内比对，以及白盒代码审计中针对深层嵌套密钥脱敏、对比源对齐与 IndexedDB 单事务配额拦截的修复实践。"
summary_en: "In browser-native AI workflow orchestration, lacking version snapshots and structural diffing traps developers in the fear of irreversible prompt and topology edits. This article documents the engineering of PatchCat's IndexedDB v7 workflow version snapshot system and structural DAG diff engine: human-AI co-creation of a 30-snapshot hard quota, default folding of coordinate-only shifts, and undoable atomic rollbacks; canonical SHA-256 topological hashing invariant to layout jitter and transient runtime state; LCS line-level prompt diffing; and whitebox audit remediations across recursive credential stripping, unified diff input normalization, and single-transaction IndexedDB quota enforcement."
tags: [AI Workflow Orchestration, DAG Engine, State Machine, IndexedDB, Structural Diff, Canonical Hash, Local-First, PatchCat]
series: "PatchCat · AI Prompt Flow Orchestrator"
---

> 项目开源地址：[GitHub - PatchCat](https://github.com/GuoBug/PatchCat)
>
> 在线体验：[PatchCat](https://guobug.github.io/PatchCat/)
>
> 往期回顾：
>
> 📖 [开源系列 25：从隐式注入到画布显式原语——MemoryNode 架构设计与确定性会话调度]({{ '/posts/2026/10/13/patchcat-memory-node-canvas-visual-primitive/' | relative_url }})
>
> 📖 [开源系列 24：纯前端端侧向量嵌入与三模混合检索]({{ '/posts/2026/10/12/patchcat-browser-native-vector-embedding-and-hybrid-search/' | relative_url }})
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

---

在纯前端环境构建 **AI 工作流编排**（AI Workflow Orchestration）系统时，随着画布上的节点从几个演进到几十个，一个现实的工程痛点开始浮现：开发者不敢轻易重构已经跑通的复杂提示词与条件分支。

在没有历史版本管理之前，画布保存是单点覆盖式的。当你为了优化某个边界 Case 而调整了上游 System Prompt、修改了路由节点的正则表达式，或者删掉了一条连线，一旦发现新效果不如预期，内存里的 `Ctrl+Z` 撤销栈只要经历过一次页面刷新或工作流切换就会彻底清空。为了保险，用户只能频繁手动导出 JSON 文件到桌面，靠文件名后缀 `v1_final_真的不改了.json` 来充当人肉版本库。

要让 **确定性工作流** 真正具备生产级的可演进性，不能只靠运行时的拓扑调度，还必须在本地持久化层补齐时间维度的状态回溯能力。

这次迭代（PRD-020 Part B），我们在 PatchCat 中落地了基于 IndexedDB v7 的工作流版本快照体系、抗坐标抖动的拓扑规范化指纹（Canonical Hash），以及面向 **DAG 状态机** 的结构化可视化 Diff 引擎。

![PatchCat Workflow Version Snapshots & Structural Diff Cover Impasto]({{ '/assets/images/cover-patchcat-workflow-version-snapshots-diff.jpg' | relative_url }})

## 一、画布演进的三道暗礁：为什么不能直接用 JSON 文本比对？

在动手写第一行代码前，我们先做了一轮方案推演：既然工作流本质上是一份包含 `nodes` 和 `edges` 的 JSON 数据，为什么不直接把两个版本的 JSON 序列化后丢给文本 Diff 库？

结合 React Flow 画布的实际运行机制分析后，直接做 JSON 文本比对会撞上三道暗礁：

1. 坐标与视图噪音淹没真实变更：用户在画布上随手拖动几个节点对齐位置，节点的 `position.x`、`position.y` 以及画布 `viewport` 就会发生几十处数值变化。在纯文本 Diff 中，这些毫无逻辑意义的像素偏移会产生满屏红绿高亮，把真正关键的 Prompt 措辞修改彻底淹没。
2. 运行时瞬态数据污染快照体积：节点在执行过程中会向 `node.data` 写入大量的运行时状态，比如几万字的流式输出文本 `output`、思维链 `reasoning`、执行耗时 `durationMs` 以及选中态 `selected`。如果原样存入快照，不仅单次快照体积膨胀十倍，还会导致每次运行完工作流都被误判为“画布已发生逻辑变更”。
3. 连线随机 ID 导致拓扑假阳性：在画布中删掉一根连线再重新连上完全相同的源节点与目标端口，React Flow 生成的 `edge.id` 往往带有随机后缀。按 `edge.id` 或原始 JSON 顺序比对，会把一条毫无变化的逻辑连线判定为“删除旧边 + 新增新边”。

这决定了我们不能照搬文本编辑器的行比对思路，必须针对有向图拓扑结构设计一套感知语义的规范化与差异提取管线。

## 二、关键节点双向共创：人机协同的架构权衡与白盒抓虫

在这次版本快照与结构化 Diff 的开发过程中，我与 AI 结对编程搭档围绕用户体验边界与底层存储安全性进行了多轮双向推演。并在初版代码落地后，通过一场逐行白盒代码审计抓出了数个潜藏在深水之下的边界漏洞。

### 1. 人类视角确立的产品与交互准则

从实际编排体验与防呆设计出发，我在需求定义阶段明确了四条不可妥协的红线：

- 拒绝静默淘汰，采用 **30 个** 版本硬配额上限：在早期的检查点模块中，我们曾使用环形缓冲区自动覆盖最旧记录。但工作流版本快照承载的是用户主动命名的里程碑（如 `v1.0 基线版`）。如果超出配额时系统静默删掉最早的基线版，会违背用户的信任预期。因此，单工作流严格限制 30 个快照，触顶时阻断新建并明确提示用户手动清理旧版本。
- 仅坐标变更（`layoutOnly`）默认折叠：在结构化 Diff 弹窗中，如果某个节点仅仅被挪动了画布坐标而业务配置分毫未改，将其归类为 `layoutOnly` 并在界面默认折叠，让用户的视线聚焦在真正的提示词与参数差异上。
- 无损回滚与密钥安全的精准切割：导出分享工作流时需要掩码提示词变量并擦除本地文件路径，但版本快照的核心使命是“本地无损时光机”。如果快照把本地路径改成相对文件名，回滚后本地文件读取节点就会失效。因此快照策略必须精细切割：强制剥离所有明文 API Key，但完整保留本地路径与提示词变量。
- 回滚操作本身必须可悔棋：点击“回滚到此版本”覆盖当前画布前，若画布存在未保存修改，必须弹出三选一脏状态守卫（先保存快照再回滚 / 直接回滚覆盖 / 取消）；且回滚动作必须压入内存 `HistoryManager` 撤销栈，允许用户随时按 `Ctrl+Z` 一键反悔。

### 2. AI 视角揭示的工程隐患与白盒审计修复

在共同推进底层实现与随后的白盒代码审查中，AI 协助识别并验证了三个极具隐蔽性的架构漏洞：

- 深层嵌套密钥的逃逸风险：初版脱敏器只清理了 `node.data.config` 顶层的敏感键名。但在向量检索与混合嵌入场景下，API Key 可能藏在 `node.data.config.embedding.apiKey` 甚至数组嵌套对象中。为此，我们将脱敏器升级为递归树遍历（`walkAndStrip`），并补齐了独立的白盒递归校验函数 `isGraphFullySanitized`，只据实标记快照的 `metadata.sanitized` 状态。
- 对比源不对称引发的幽灵差异与明文回显：在 Diff 弹窗中，历史快照里的节点已经过 `prepareVersionGraph` 清洗（剥离了运行时输出与明文密钥），而当前画布的 `currentNodes` 却带着未清洗的内存状态直接送入 `computeWorkflowDiff`。这导致两个严重后果：一是用户在内存里配了 API Key 时，Diff 视图会永远报错说该节点“被修改”，甚至在差异卡片里把明文 Key 渲染到屏幕上；二是快照保存弹窗的 `isDuplicateHash` 判重也会因此失效。修复方案是将实时画布节点在进入 Hash 计算和 Diff 引擎前，统一先过一遍 `prepareVersionGraph` 归一化流水线，并在 UI 展示层增加敏感字段掩码兜底。
- IndexedDB 跨异步读写的配额竞态：如果先调用 `countWorkflowVersions` 异步查询数量，再调用 `saveWorkflowVersion` 写入，两个独立事务之间存在时间窗口，并发点击下可能突破 30 个版本的硬上限。我们在 IndexedDB v7 适配器中专门实现了单事务原子守卫 `saveWorkflowVersionWithQuota`，在同一个 `readwrite` 事务内通过复合索引 `by_workflow_created` 完成计数校验与写入，超限时直接触发 `tx.abort()` 回滚事务。

## 三、拓扑规范化指纹与结构化 DAG Diff 引擎

为了让系统能够准确回答“这两张画布在逻辑上是否完全等价”，我们在 `src/services/versioning/workflow-diff-engine.ts` 中构建了二阶段比对流水线：第一阶段计算抗噪的规范化拓扑指纹，第二阶段执行分层的结构化与行级比对。

![PatchCat Structural DAG Diff & Canonical Hash Prism]({{ '/assets/images/intext-patchcat-structural-dag-diff-prism.jpg' | relative_url }})

### 1. 剥离噪音的规范化指纹（Canonical Topological Hash）

计算工作流指纹时，任何与 DAG 执行语义无关的字段都必须被剔除，且对象键名与集合顺序必须严格确定性排序：

```typescript
export function canonicalizeGraph(
  nodes: Node<CustomNodeData>[],
  edges: Edge[]
): { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] } {
  const canonicalNodes = nodes
    .map((n) => canonicalizeNode(n))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const canonicalEdges = edges
    .map((e) => canonicalizeEdge(e))
    .sort((a, b) => {
      const keyA = `${a.source}|${a.sourceHandle}|${a.target}|${a.targetHandle}|${a.edgeType}`;
      const keyB = `${b.source}|${b.sourceHandle}|${b.target}|${b.targetHandle}|${b.edgeType}`;
      return keyA.localeCompare(keyB);
    });

  return { nodes: canonicalNodes, edges: canonicalEdges };
}
```

这套规范化规则确立了四项不变性契约：
1. 坐标与视口无关性：完全忽略 `position`、`positionAbsolute`、`width`、`height` 与画布 `viewport`，哪怕把整张图从左往右平移 1000 像素，计算出的 SHA-256 指纹依然保持一致。
2. 运行时脏状态无关性：在构建节点摘要时，通过 `TRANSIENT_NODE_DATA_KEYS` 黑名单过滤掉 `status`、`output`、`logs`、`reasoning`、`selected` 等全部运行时瞬态属性。
3. 边 ID 无关性：连线比对不看随机生成的 `edge.id`，仅提取五元组 `source | sourceHandle | target | targetHandle | edgeType` 进行字典序排列。
4. 键序无关性：通过 `sortKeysDeep` 递归对所有嵌套配置对象的 Key 按字母表升序重排，序列化为紧凑 JSON 后交由 Web Crypto API 的 `crypto.subtle.digest('SHA-256', data)` 生成 64 位十六进制指纹。

### 2. 结构化分层 Diff 与 LCS 行内比对护栏

当两个版本的拓扑指纹不同时，`computeWorkflowDiff` 会从节点集、连线集和长文本字段三个维度提取结构化差异：

| 比对维度 | 识别粒度 | 核心判定机制与工程护栏 |
| :--- | :--- | :--- |
| 节点级（Nodes） | 新增 / 删除 / 业务逻辑变更 / 仅位置移动 | 按 `node.id` 哈希对齐；深比较语义属性与坐标偏移 $\Delta x, \Delta y \ge 1\text{px}$，分离 `modified` 与 `layoutOnly` |
| 连线级（Edges） | 新增连线 / 移除连线 | 基于 `source + sourceHandle -> target + targetHandle + type` 复合签名多重集匹配，无视随机 Edge ID |
| 文本级（Prompt/Code） | 行级 `equal` / `insert` / `delete` | 针对 `prompt`、`systemPrompt`、`code` 等长文本字段运行动态规划 LCS 算法，设 $4\times 10^6$ 单元格熔断上限 |

在对比几十行长的 System Prompt 或自定义 JavaScript 代码节点时，仅知道“字段变了”是不够的。我们为长文本配置项内置了基于最长公共子序列（LCS）的逐行比对器。同时，为了防止极端情况下（例如用户在单个节点里塞入上万行长文本）$O(M \times N)$ 的二维矩阵撑爆浏览器主线程内存，我们在代码中加入了硬性熔断护栏：

```typescript
const MAX_LCS_CELLS = 4_000_000;

export function computeLineDiff(oldText: string, newText: string): LineDiffHunk[] {
  if (oldText === newText) {
    if (!oldText) return [];
    return oldText.split('\n').map((value, idx) => ({
      type: 'equal',
      value,
      oldLineNumber: idx + 1,
      newLineNumber: idx + 1,
    }));
  }

  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];
  const m = oldLines.length;
  const n = newLines.length;

  // 主线程防卡死护栏：超出 400 万单元格直接退化为整块删除+新增
  if (m * n > MAX_LCS_CELLS) {
    return [
      ...oldLines.map((value, idx) => ({ type: 'delete' as const, value, oldLineNumber: idx + 1 })),
      ...newLines.map((value, idx) => ({ type: 'insert' as const, value, newLineNumber: idx + 1 })),
    ];
  }
  // ... 标准扁平化 Int32Array LCS 回溯
```

为了减小垃圾回收压力，LCS 动态规划表没有使用二维嵌套数组，而是分配了一块连续的 `new Int32Array((m + 1) * (n + 1))` 类型化数组，在保证毫秒级响应的同时守住了主线程帧率。

## 四、零明文脱敏防线与可悔棋的原子回滚状态机

版本快照不仅要看清差异，更要保证存得安全、回得稳妥。

![PatchCat Zero-Plaintext Sanitizer & Temporal Rollback Sieve]({{ '/assets/images/intext-patchcat-audit-zero-plaintext-rollback.jpg' | relative_url }})

### 1. 递归敏感键擦除与白盒递归校验

在 `src/services/export/workflow-sanitizer.ts` 中，当快照服务调用 `prepareVersionGraph` 时，系统会遍历每一个节点的数据树，递归剥离所有匹配 `/^(apiKey|api_key|secret|token|password|credential|authorization|bearer|private_key|access_key|client_secret)$/i` 的键名：

```typescript
const walkAndStrip = (obj: Record<string, unknown>): void => {
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      if (typeof val === 'string' && val.trim() !== '') {
        redactedKeysCount++;
      }
      delete obj[key];
      continue;
    }
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object') {
          walkAndStrip(item as Record<string, unknown>);
        }
      }
    } else if (val && typeof val === 'object') {
      walkAndStrip(val as Record<string, unknown>);
    }
  }
};
```

为了杜绝“硬编码标记已脱敏”的虚假安全感，快照写入前会调用 `isGraphFullySanitized(cleanNodes)` 对克隆后的节点树做二次白盒扫描，确认任意深度下均无非空敏感键值残留，才将快照元数据中的 `sanitized` 置为 `true`。

### 2. IndexedDB v7 单事务配额守卫与可悔棋回滚

在存储层，我们将本地数据库 schema 升级到了 `DB_VERSION = 7`，新增 `workflow_versions` 对象仓库及复合索引 `by_workflow_created: ['workflowId', 'createdAt']`。当工作流本身被删除时，底层会在同一个事务内级联清空其关联的所有历史快照，防止产生孤儿数据。

而在用户点击“回滚到此版本”时，系统按严格的状态机顺序执行五步原子动作：
1. 运行态拦截：若当前工作流正在执行（`isExecuting === true`），直接拒绝回滚并弹出提示，防止打断运行中的异步流。
2. 脏状态三选一守卫：调用 `getDirtyState(currentNodes, currentEdges)` 比对实时画布与最新快照的规范化指纹。若存在未保存变更，弹窗询问用户是“先保存快照再回滚”、“直接覆盖回滚”还是“取消”。
3. 压入撤销历史栈：在替换画布前，调用 `HistoryManager.getInstance().pushState(currentNodes, currentEdges)` 将当前画布状态压入内存撤销栈。
4. 节点深拷贝还原与运行时清零：将目标快照的节点与连线深拷贝回填至 Zustand Store，强制将所有节点的 `status` 重置为 `'idle'`，并恢复快照记录的 `viewport`。
5. 双层持久化落盘：立即触发 `saveCurrentWorkflow()`，确保回滚后的画布状态同步写回 `WORKFLOWS_PAYLOAD` 持久化存储，避免刷新浏览器后退回旧状态。

## 五、方案代价与适用边界

任何工程架构都是特定约束下的权衡结果，这套纯前端版本快照与结构化 Diff 方案同样存在明确的边界与代价：

1. 30 版本硬配额的手动清理成本：为了保护早期关键基线版本不被环形缓冲区静默覆写，我们选择了达到 30 个版本后阻断新建的硬配额策略。代价是重度用户在高频迭代后必须手动删除过期的中间快照，无法享受全自动无感滚动。
2. 超大节点的行级 Diff 退化：受限于浏览器主线程算力与内存安全，`computeLineDiff` 设置了 `MAX_LCS_CELLS = 4_000_000` 的熔断阈值。如果用户在单个代码节点或提示词节点中粘贴了超过 2000 行的巨型文本，行内精细高亮会自动退化为整块删除与整块新增展示。
3. 快照范围的物理边界：工作流版本快照仅捕获画布的静态拓扑结构与节点配置（`nodes`、`edges`、`viewport`），不包含历史执行产生的模型输出日志，也不会对外部 IndexedDB 知识库中的原始文档切片打快照。如果用户在知识库管理器中删除了某篇文档，回滚工作流拓扑并不会恢复外部知识库文件。
4. 多标签页并发升级阻塞：IndexedDB 从 v6 升级到 v7 时，如果同一浏览器中另有未关闭的旧版 PatchCat 标签页持有数据库连接，会触发 `onblocked` 事件。我们为此配置了 `onversionchange` 自动释放连接与 3000ms 超时降级保护，但在极端跨标签页占用下仍可能回退至内存临时态。

## 六、总结与后续推进

从最初只能靠手动导出 JSON 文件备份，到现在支持 `Ctrl+Shift+S` 一键打快照、自动过滤坐标抖动的拓扑指纹判重、字段级 LCS 可视化比对以及可 `Ctrl+Z` 悔棋的安全回滚，PatchCat 在本地画布的演进安全性上补齐了关键一环。

结合白盒代码审计的复盘修复，我们不仅验证了递归脱敏、对比源归一化与单事务配额拦截的可靠性，也将全量自动化测试套件扩充到了 **592 项**（覆盖 172 个测试套件），并通过了 React 19 严格渲染纯度检查（`react-hooks/purity`）。

在接下来的迭代中，我们将围绕画布节点的组织效率与复用能力继续演进，探索多选子图一键折叠封装为自定义组件与模板市场机制，欢迎对前端可视化编排感兴趣的朋友一起交流探讨。

---

> 下一篇预告
>
> 📖 《PatchCat 工程复盘：画布子图折叠封装与可复用组件契约设计（开源系列 27）》

---

> **关于作者**  
> **郭强 (GuoBug)**，Product Engineer，做平台工程也做业务增长。目前主要在折腾 AI 工作流编排、DAG 状态机与确定性系统架构。  
> 开源项目与主页：[https://github.com/GuoBug](https://github.com/GuoBug) · [https://guobug.github.io](https://guobug.github.io)  
> 欢迎就工作流引擎架构、拓扑调度和低门槛开发体验交流指教。
