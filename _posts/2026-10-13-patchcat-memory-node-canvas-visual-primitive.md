---
layout: post
title: "PatchCat 工程复盘：从隐式注入到画布显式原语——MemoryNode 架构设计与确定性会话调度（开源系列 25）"
title_en: "PatchCat Engineering Notes: From Implicit State Injection to Visual Canvas Primitives — MemoryNode Architecture and Deterministic Session Scheduling"
date: 2026-10-13 14:00:00 +0800
categories: [AI, Architecture, Engineering]
pub_tag: "MemoryNode & Deterministic Session Scheduling"
math: true
read_time: "18 MIN READ"
summary: "PatchCat 是一个纯浏览器运行的 AI 工作流编排工具。此前，多轮会话记忆依赖调试面板隐式注入全局变量，DAG 状态机对此完全不可见，导致画布调试缺少变量、记忆策略全流程一刀切，违背了流程即文档的设计初衷。本文记录 MemoryNode 画布原语的落地过程：人机协同梳理只读数据流与断点续跑非缓存规约，解耦滚动摘要、近期窗口与置顶消息三通道，实现无会话平滑降级，并讨论只读图元的边界与后续版本快照规划。"
summary_en: "PatchCat is a browser-based AI workflow orchestrator. Previously, multi-turn conversation memory was implicitly injected via UI panels, leaving the DAG engine unaware of session context. This article documents the implementation of the MemoryNode visual primitive: co-creative architectural decisions on read-only safety to eliminate double-write and dry-run pollution, non-cacheable checkpoint resumption, sub-workflow boundary isolation, tri-channel output contracts (summary, recent window, pinned items), and graceful degradation."
tags: [AI Workflow Orchestration, DAG Engine, State Machine, MemoryNode, Conversation Memory, Checkpoint Resumption, Local-First, PatchCat]
series: "PatchCat · AI Prompt Flow Orchestrator"
---

> 项目开源地址：[GitHub - PatchCat](https://github.com/GuoBug/PatchCat)
>
> 在线体验：[PatchCat](https://guobug.github.io/PatchCat/)
>
> 往期回顾：
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
>
> 📖 [开源系列 17：上下文窗口裁剪与原子更新]({{ '/posts/2026/09/29/ai-prompt-orchestrator-context-engineering-dual-anchor-pruning/' | relative_url }})

---

在浏览器端做 **AI 工作流编排**（AI Workflow Orchestration），可视化画布最大的价值是所见即所得。节点代表计算，连线代表数据流动，整张拓扑图就是系统行为的最完整文档。

但在之前的版本中，多轮会话记忆的流转方式偏离了这条准则。

历史对话摘要与上下文窗口并没有作为图元出现在画布上，而是在调试面板运行工作流的前一刻，由界面代码把计算好的记忆变量悄悄塞进全局输入字典。底层执行引擎对会话状态毫无感知，下游节点只能凭空引用隐式注入的变量名。

这种实现虽然能在面板调试时勉强跑通，却带来了明显的工程裂痕：从画布顶部直接点击运行，记忆变量凭空消失；所有节点只能被迫共用一套固定的记忆窗口配置；而且暗中注入的全局状态打破了 **确定性工作流** 的因果确定性。

这次重构的重点，是把隐式注入的记忆变量收敛成画布上可观测、可配置的显式节点——MemoryNode，让整个 **DAG 状态机** 重新恢复确定性调度。

![PatchCat MemoryNode Canvas Primitive Cover Impasto]({{ '/assets/images/cover-patchcat-memory-node-canvas-primitive.jpg' | relative_url }})

## 一、暗中注入的三大技术债务

回顾旧版代码，记忆变量是在 `ChatDebugPanel.tsx` 准备运行工作流时写入全局字典的：

```typescript
const injection = buildContextInjectionBag({
  messages: memoryMessages,
  summary: sessionSummary,
  options: { maxHistoryRounds, maxTokenBudget, pruningStrategy: 'hybrid' },
});

inputsBag['chat_summary'] = injection.chat_summary;
inputsBag['chat_history'] = injection.chat_history;
```

这种做法省下了设计节点的工夫，却在三个层面制造了长期隐患：

1. 执行入口割裂：用户在右侧对话面板点击发送，提示词节点能读到历史记录；一旦用户关上面板，在画布工具栏点击主运行按钮进行单流调试，记忆变量就完全不存在。下游提示词模板中引用的记忆插槽直接解析为空字符串，让测试行为在两个入口间产生行为偏差。
2. 策略一刀切，无法差异化配置：整个工作流只能遵循一套全局记忆参数。但在实际业务中，意图识别节点往往只需要精简的滚动摘要，而最终的总结节点则需要完整的近期对话窗口。隐式全局注入剥夺了节点级别的独立裁剪权限。
3. 因果流向黑盒化：画布主张“连线即数据依赖”。提示词节点明明深度依赖上一轮会话，画布表面上却没有任何输入连线，上下文仿佛凭空产生，违背了白盒编排的核心理念。

## 二、关键节点双向共创：人机搭档的设计抉择

在确定要把记忆做成画布节点的共识后，项目全程借助 AI 结对编程推进。但在决定系统架构走向的关键节点上，不是由一方单向提需求或被动修错，而是双方在工程规约与使用体验上互相启发并校准边界。

### 1. 人类视角提的核心决策：v1 原语严格只读

起初技术推演时，曾考虑过让 MemoryNode 兼具读写能力：节点被调度时读取历史，执行完毕后再负责把本轮输出写回 IndexedDB 会话库。

但我从业务场景与极端测试的角度否定了读写合一的设想。如果节点具备写副作用，在真实运行时会引发三种严重缺陷：

- 双写竞争：对话面板在整条流水线跑完后会统一做一次持久化，如果节点执行时也自行写入，一条回复会被重复持久化两次。
- 重放写污染：断点续跑和单节点重试会多次调度同一个节点，带有写副作用的节点会破坏调度的幂等性，导致历史记录无限追加重复数据。
- 模拟运行污染：在开启模拟运行或跳过模型调用时，假数据会被直接写入真实数据库，造成会话污染。

因此，人类侧确立了原则：v1 阶段 MemoryNode 必须是纯粹的只读数据源，对话面板依然是唯一的写入方。

同时，针对“画布顶部直接运行无会话”的场景，确立了平滑降级契约：如果没有传入会话标识，节点安全输出空字符串并标记无会话状态，绝不抛出异常阻断下游节点。

### 2. AI 视角提的核心风险：断点续跑与作用域隔离

面对确立的只读模型，AI 在推演底层拓扑调度时指出了两个深层系统隐患：

- 断点续跑缓存死锁：在断点续跑机制中，调度引擎会复用祖先节点已有的执行快照以节省计算资源。但 AI 提出，MemoryNode 依赖外部动态会话库，如果用户在两次运行之间在面板里输入了新消息，复用缓存会导致节点读不到最新轮次，造成记忆上下文停滞。因此，调度引擎在做祖先剪枝时，必须把 MemoryNode 标记为非缓存节点，强制每次重读数据库。
- 子工作流跨边界数据泄漏：子工作流具备独立的作用域隔离。AI 指出必须拦截会话标识向子图透传，子工作流内部的 MemoryNode 必须恒定保持无会话状态，防止父子工作流共用同一份历史数据造成串话。
- 全禁用状态的拓扑预检：如果用户在属性面板中把摘要、窗口和置顶全部关闭，节点在逻辑上已经退化为无意义节点，拓扑分析模块应当在运行前主动抛出预检警告。

通过这两轮双向权衡，MemoryNode 的契约最终收敛为高可靠的确定性方案。

## 三、架构拆解：三通道解耦与双模格式输出

基于上述决策，我们将 MemoryNode 落地为模块化执行器，整体流转架构如下图所示：

![PatchCat MemoryNode Architecture & Deterministic Scheduling]({{ '/assets/images/flowchart-patchcat-memory-node-deterministic-scheduling.svg' | relative_url }})

节点内部划分为三个正交提取通道，下游可按需勾选启用：

### 1. 滚动摘要通道（Rolling Summary）
对应持久化层的长效总结文本。当会话轮次超出近期窗口时，后台摘要器会异步提炼关键事实。若勾选此项，节点将摘要写入独立字段，没有摘要时回退为空字符串。

### 2. 近期逐字窗口通道（Recent Window）
提取最近 $N$ 轮非置顶对话（1 轮对应用户与模型各 1 条消息）。如果配置了 Token 预算上限，节点会从最旧的消息开始贪心剔除，直至整体大小收敛到预算内，并同步将元数据中的截断标记置为真。

### 3. 置顶消息通道（Pinned Messages）
提取用户在调试面板中手动加星置顶的重点约束（如特定的业务规则）。这一通道独立输出，完全不受近期窗口轮数的裁剪，保证核心指令不被滑动窗口冲刷淘汰。

### 4. 双模格式塑形器（Format Shaper）
为了兼顾不同下游节点的接入方式，节点提供两种输出格式：
- `format: 'text'`：输出格式化换行文本，下游提示词模板可通过 `\{\{memory_1.history\}\}` 直接拼接入模板。
- `format: 'messages'`：输出标准的 ChatML 结构化对象数组，下游 LLM 或 Agent 节点可以直接将其作为历史消息列表消费。

## 四、确定性调度与防御机制实现

在具体代码工程中，这一套设计通过三道防御措施融入了底层引擎。

![PatchCat MemoryNode Read-Only Safety Dam]({{ '/assets/images/intext-patchcat-memory-node-read-only-safety.jpg' | relative_url }})

### 1. 执行器无异常保证

在模块化执行器 `src/engine/nodes/memory.ts` 中，我们为无会话和空存储构筑了完整的兜底逻辑：

```typescript
// 1. Session Availability Guard (L4 Never-Throw Contract)
const rawSessionKey = ctx.options?.sessionKey?.trim();
if (!rawSessionKey) {
  return {
    summary: '',
    history: format === 'messages' ? [] : '',
    pinned: '',
    meta: {
      session_status: 'no_session',
      rounds: 0,
      tokens: 0,
      truncated: false,
    },
  };
}
```

即使在底层存储读取失败的极端情况下，执行器也会捕获异常并返回空状态，确保整条画布链路能够继续运行，符合无异常中断的容错标准。

### 2. 断点续跑非缓存穿透

在 `browser-engine.ts` 的反向广度优先搜索剪枝逻辑中，针对记忆节点增加了非缓存穿透规约：

```typescript
// 检查祖先节点是否命中有效缓存
const predNode = graph.nodes.find((n) => n.id === pId);
const isNonCacheable = (predNode?.data?.type || predNode?.type) === 'memory';
const hasCachedOutput =
  !isNonCacheable && context[pId] && Object.keys(context[pId]).length > 0;

if (!hasCachedOutput && !targetNodesToRun.has(pId)) {
  targetNodesToRun.add(pId);
  expanded = true;
}
```

无论是断点续跑还是单节点就地重试，调度器都会把 MemoryNode 视作动态数据源，强制重新从存储中读取最新状态，避免了使用过期上下文的系统风险。

### 3. 子工作流数据边界隔离

在子工作流委托执行阶段，父级引擎克隆上下文时显式剥离了会话标识：

```typescript
for await (const evt of subEngine.executeWorkflow(targetGraph, {
  inputs: isolatedInputs,
  signal,
  triggerMode: 'subworkflow',
  workflowId: targetId,
  context: {
    ...options?.context,
    callChain: nextChain,
  },
  // sessionKey 被完全排除，不向下游子流传递
}))
```

子工作流内的 MemoryNode 因此必然命中无会话分支，消除了父子流程相互串话的可能。

## 五、方案代价与适用边界

任何真实的工程选型都有其代价，MemoryNode 也不例外：

1. 只读图元的局限：目前的节点不能处理单次运行过程中的动态记忆写入。如果某个 Agent 节点在自主循环中希望向记忆库追加阶段性备忘，v1 原语无法承载这一需求。后续引入写模式时，必须设计基于执行编号与节点编号的幂等写入键，并配合模拟运行屏蔽机制，复杂度会有所上升。
2. 状态感知依赖标识传递：MemoryNode 无法无感推测当前处于哪个会话，必须由外部调用方显式传递会话键。这使得无会话直接运行画布时，节点只能输出空内容，依赖属性面板上的提示帮助用户理解当前状态。
3. 版本快照工程分步：在需求规划中，工作流版本快照（IndexedDB 版本升级、拓扑差异比对与回滚）原计划与 MemoryNode 一同交付。但在评估改动面后，我们决定将版本快照顺延至后续里程碑，遵循微步迭代节奏，避免单次升级牵扯过多持久化仓库变更。

## 六、总结与后续推进

本次重构把隐匿在界面代码中的会话记忆逻辑抽离出来，转换为画布上清晰可见的 MemoryNode 原语。

通过三通道解耦、双模格式输出与断点续跑非缓存控制，补齐了画布直接调试时的行为断层，也让整个工作流的状态管理重回确定性轨范。目前，工程中包括记忆节点单元测试在内的 **574 项** 自动化测试已全部通过，类型检查与生产构建均保持正常。

接下来，我们将继续推进工作流版本快照体系的建设，支持命名快照保存、画布拓扑差异可视化展示与单步撤销回滚，进一步提升本地编排的演进安全性。

---

> 下一篇预告
>
> 📖 [《PatchCat 工程复盘：IndexedDB 工作流版本快照、拓扑规范化指纹与结构化 DAG Diff 实战（开源系列 26）》]({{ '/posts/2026/10/16/patchcat-workflow-version-snapshots-and-structural-diff/' | relative_url }})

---

> **关于作者**  
> **郭强 (GuoBug)**，Product Engineer，做平台工程也做业务增长。目前主要在折腾 AI 工作流编排、DAG 状态机与确定性系统架构。  
> 开源项目与主页：[https://github.com/GuoBug](https://github.com/GuoBug) · [https://guobug.github.io](https://guobug.github.io)  
> 欢迎就工作流引擎架构、拓扑调度和低门槛开发体验交流指教。
