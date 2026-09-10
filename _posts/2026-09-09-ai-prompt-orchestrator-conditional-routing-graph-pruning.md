---
layout: post
title: "从 0 到 1 打造 AI 提示流编排器：条件分支路由、Kahn 图剪枝与 HTTP 节点实战（开源系列 06）"
title_en: "Building AI Prompt Orchestrator: Conditional Routing, Kahn Graph Pruning & HTTP Request Node"
date: 2026-09-09 10:00:00 +0800
categories: [AI, ControlFlow, Architecture]
pub_tag: "AI & Engine"
summary: "深度复盘 AI 提示流编排器 PatchCat 核心引擎跃迁：从静态单向管道升级为图灵完备的动态控制流。实现 9 种规则算子的 IF/ELSE 条件分支节点、Kahn 拓扑排序在分支下的动态剪枝（Dynamic Branch Skipping）机制、解决多路汇聚死锁的变量聚合器（AggregatorNode），以及具备协议拦截与指数退避重试的 HTTP 弹性请求引擎。"
summary_en: "Deep dive into PatchCat's core engine evolution: from static DAG to Turing-complete control flow. Implementing 9-operator IF/ELSE condition nodes, Kahn dynamic branch skipping without deadlocks, Variable Aggregator node for branch reconvergence, and resilient HTTP request engine with protocol sanitization and exponential backoff."
read_time: "12 MIN READ"
tags: [AI, DAG, Kahn Algorithm, Conditional Routing, Variable Aggregator, HTTP, React Flow, Open Source]
---

> **项目开源地址**：[https://github.com/GuoBug/PatchCat](https://github.com/GuoBug/PatchCat)  
> **在线体验**：[https://guobug.github.io/PatchCat/](https://guobug.github.io/PatchCat/)  
> **往期回顾**：  
> 📖 [《从 0 到 1 打造 AI 提示流编排器：双引擎架构与纯前端 DAG 实践（开源系列 01）》]({{ '/posts/2026/08/28/ai-prompt-orchestrator-dual-engine/' | relative_url }})  
> 📖 [《从 0 到 1 打造 AI 提示流编排器：Kahn 拓扑排序、安全变量引擎与异步运行时实战（开源系列 02）》]({{ '/posts/2026/08/28/ai-prompt-orchestrator-kahn-runtime/' | relative_url }})  
> 📖 [《从 0 到 1 打造 AI 提示流编排器：多模型生态适配、流式思维链与三级日志实战（开源系列 03）》]({{ '/posts/2026/09/01/ai-prompt-orchestrator-multi-model-observability/' | relative_url }})  
> 📖 [《从 0 到 1 打造 AI 提示流编排器：告别单画布重绘瓶颈，状态机分层解耦与双模存储实战（开源系列 04）》]({{ '/posts/2026/09/03/ai-prompt-orchestrator-multi-workflow-dual-storage/' | relative_url }})  
> 📖 [《从 0 到 1 打造 AI 提示流编排器：从 Dify 学习知识库架构，实现私有文档检索与 RAG 画布节点（开源系列 05）》]({{ '/posts/2026/09/04/ai-prompt-orchestrator-rag-knowledge-node/' | relative_url }})

---

## 一、 引言：告别线性单向流，编排器必须迎来“逻辑决策大脑”

在前五篇文章中，我们为开源 AI 提示流编排器 **PatchCat** 逐步浇筑起了一套稳健的底座：从最初纯前端与本地 FastAPI 双引擎适配，到基于 Kahn 算法的分层拓扑调度、多模型流式思维链，再到抽屉式多流程管理与仿 Dify 的三层 RAG 私有知识库。

然而，当系统在真实业务场景中试跑时，一个不可回避的结构性瓶颈赫然显现：**此前的 PatchCat 本质上只是一条“单向走到底的线性数据管道”。**

在现实的 AI Agent 业务中，没有哪套流程是一条平铺直叙的单行道：
1. **意图路由与条件分支**：智能客服工单必须先由分类器判断用户诉求（例如技术故障 vs 账单争议 vs 通用咨询），进而分流给不同 Prompt 模板和不同微调模型进行针对性应答；
2. **外部系统联动**：AI 不能闭门造车，它必须能作为中枢实时调用外部的 CRM、天气预报、库存中心或企业自建的 OpenAPI；
3. **汇流与多路结果收口**：不论分流走向了分支 A 还是分支 B，下游的总结回复节点必须能平滑提取到已激活分支的有效数据，并向终端用户输出最终结论。

将画布由“单向流水线”升级为“具备条件决策与外部网络触角的智能工作流”，听起来顺理成章。但在工程底层，**在基于 Kahn 算法的 DAG 拓扑调度中引入 IF/ELSE 动态分支，会瞬间引发图遍历调度中的“分支跳过与汇聚死锁（Reconvergence Deadlock）”危机**。

本篇依然秉承我与 AI 搭档（Google Gemini）**全程结对辅助编程（AI Pair Programming）与“干中学（Learning by Doing）”**的原则，真实复盘我们在 PatchCat v0.3.0 中，如何推导演进并攻克这一核心图计算卡点的全过程。

---

## 二、 关键决策与双向共创：人机启发推演矩阵 (Milestone Co-Discovery)

面对条件分支与网络节点带来的架构挑战，我们拒绝盲目修改现有代码，而是先在草稿本与白板上展开了多轮人机双向启发推演：

### 关键点 1：条件分支下的“调度死锁”与“动态剪枝”
- **我提出的业务场景与体验痛点**：
  在配置“客服意图分类”预设时，大模型在前方输出了 `category = "tech"`。画布上的条件分支节点将数据分流给了“技术支持 Prompt 节点”，而“账单咨询 Prompt 节点”理应被跳过。然而，当这两个分支同时连向下游的一个“汇总回复”节点时，整个下游节点由于等不到“账单”分支的数据，直接卡死挂起或报错空指针崩溃。
- **AI 搭档指出的底层算法瓶颈**：
  AI 搭档从图论调度底层指出：我们在系列 02 中实现的 Kahn 算法，是通过全局有向无环图的“入度清零”来划分并发波次（Execution Waves）的。Kahn 算法在编译期默认认为**所有入度边都必须交付输出**。一旦引入运行期动态分流，未命中的分支如果直接“不执行”，依赖它的下游节点入度将永远无法归零；若强行执行，下游节点又会因为丢失关键变量而抛出异常。
- **双向共创的方案权衡 (Trade-offs)**：
  - *方案 A（动态子图重构）*：每遇到条件节点，运行时重新计算下游可达子图并动态剔除死分支。缺点是算法极其复杂，破坏了 React Flow 画布节点的实时状态对应与时间线回溯；
  - *方案 B（自上而下的运行时动态分支剪枝 Dynamic Branch Skipping）*：**最终选型**。完整保留 Kahn 静态分层波次，但在节点调度器中引入 `skippedNodes` 标记与 `NODE_SKIPPED` 事件下发。当条件命中某一分支时，未激活分支的下游依赖链自上而下逐级继承 `skipped` 标记，轻量、纯粹且绝不破坏图拓扑结构的稳定性。

### 关键点 2：多路汇聚困局与变量聚合器（Variable Aggregator）
- **我提出的直觉诉求**：
  既然分支被标记为 `skipped`，能不能让普通的下游节点（比如 LLM 节点）“聪明一点”，只要检测到哪个上游有数据就用哪个？
- **AI 搭档提出的系统规约警示**：
  AI 强烈建议不要把这种“或逻辑”隐式耦合进普通的 Prompt、LLM 或 Code 节点中。普通节点的契约职责是“确定性转换”，如果让所有基础节点都支持“部分依赖就绪即可执行”，会导致整个变量引用的作用域解析彻底失控（模糊歧义）。必须遵循 Unix 的单一职责哲学，**引入专用的【变量聚合器节点（AggregatorNode）】**，作为多分支合流的显式网关契约。

### 关键点 3：HTTP 节点的网络弹性与协议防线
- **我提出的连接诉求**：
  支持 GET/POST/PUT/DELETE 与常见鉴权（Bearer / Basic / API-Key），让工作流可以自由调用真实世界的公共与内网 API。
- **AI 搭档设定的安全与韧性边界**：
  前端浏览器直发请求存在两大隐患：一是恶意协议注入（如通过变量拼接构造出 `file://` 或 `javascript:` 伪协议诱发 XSS / SSRF 泄露）；二是网络偶发抖动。AI 搭档提出：必须在执行前实行协议白名单强制断言，并在遭遇 500/502/503/504 等服务端瞬态故障时，强制引入基于几何级数的**指数退避重试（Exponential Backoff Retry）**。

---

## 三、 核心技术剖析一：Kahn 拓扑排序中的“动态分支剪枝”算法

在 `src/engine/browser-engine.ts` 中，我们为工作流引擎引入了动态条件求值与分支跳过逻辑：

![Kahn 拓扑调度中的动态分支剪枝机制]({{ '/assets/images/conditional-branch-skipping.png' | relative_url }})

### 1. 9 种条件规则匹配器
我们在 `ConditionNode` 中定义了 9 大常用逻辑算子，满足数值比较、文本包含、正则匹配与判空：

```typescript
// src/engine/browser-engine.ts (核心规则评估)
export function evaluateCondition(rule: ConditionRule, actualVal: unknown): boolean {
  const op = rule.operator;
  const targetVal = rule.value;

  switch (op) {
    case 'equals':
      return String(actualVal ?? '').trim() === String(targetVal ?? '').trim();
    case 'not_equals':
      return String(actualVal ?? '').trim() !== String(targetVal ?? '').trim();
    case 'contains':
      return String(actualVal ?? '').includes(String(targetVal ?? ''));
    case 'not_contains':
      return !String(actualVal ?? '').includes(String(targetVal ?? ''));
    case 'greater_than':
      return Number(actualVal) > Number(targetVal);
    case 'less_than':
      return Number(actualVal) < Number(targetVal);
    case 'is_empty':
      return actualVal === null || actualVal === undefined || String(actualVal).trim() === '';
    case 'is_not_empty':
      return actualVal !== null && actualVal !== undefined && String(actualVal).trim() !== '';
    case 'regex_match':
      try {
        return new RegExp(String(targetVal)).test(String(actualVal ?? ''));
      } catch {
        return false;
      }
    default:
      return false;
  }
}
```

### 2. 波次调度器中的分支判定与静默跳过（Branch Skipping）
在执行波次循环中，每个节点在正式开始执行前，都会通过其所有的输入边（Incoming Edges）计算是否应当被“剪枝跳过”：

```typescript
// src/engine/browser-engine.ts (分层波次中自上而下的跳过判定)
const incoming = incomingEdgesMap.get(node.id) || [];
let shouldSkip = skippedNodes.has(node.id);

if (!shouldSkip && incoming.length > 0) {
  if (node.data.type === 'aggregator') {
    // 聚合器节点特殊规约：只要有至少一条入度边未被跳过，节点即可正常激活！
    const hasActiveIncoming = incoming.some((edge) => {
      if (skippedNodes.has(edge.source)) return false;
      const srcNode = nodeMap.get(edge.source);
      if (srcNode && srcNode.data.type === 'condition') {
        const activeBranch = nodeActiveBranch.get(edge.source);
        if (activeBranch && edge.sourceHandle && edge.sourceHandle !== activeBranch) {
          return false; // 非命中分支的 Handle 视为 Inactive
        }
      }
      return true;
    });
    if (!hasActiveIncoming) shouldSkip = true;
  } else {
    // 普通节点严格规约：只要存在来自未命中分支或已跳过节点的边，整节点跳过
    const isAnyIncomingInactive = incoming.some((edge) => {
      if (skippedNodes.has(edge.source)) return true;
      const srcNode = nodeMap.get(edge.source);
      if (srcNode && srcNode.data.type === 'condition') {
        const activeBranch = nodeActiveBranch.get(edge.source);
        if (activeBranch && edge.sourceHandle && edge.sourceHandle !== activeBranch) {
          return true;
        }
      }
      return false;
    });
    if (isAnyIncomingInactive) shouldSkip = true;
  }
}

if (shouldSkip) {
  skippedNodes.add(node.id); // 记录跳过节点，自动向下游穿透传播
  eventQueue.push({
    type: 'NODE_SKIPPED',
    payload: { nodeId: node.id, reason: 'Condition branch not matched or upstream node was skipped' },
  });
  return { nodeId: node.id, status: 'success', output: {}, durationMs: 0 };
}
```

**这段设计的绝妙之处在于**：
未命中的分支不会抛出异常中断执行，也不会被从波次队列中硬性抹去，而是以 `durationMs: 0` 和 `NODE_SKIPPED` 事件静默收尾。画布前端收到该事件后，节点卡片立刻呈现优雅的淡灰色禁用视觉，清晰展现出分支路由的决策轨迹。

---

## 四、 核心技术剖析二：打破汇聚死锁——变量聚合器（Variable Aggregator）

当工作流通过 `ConditionNode` 分叉成多条业务线后，最终往往需要合并到同一个输出或后续处理中。如前所述，普通节点要求上游全量就绪，无法承担“二选一”合流的任务。

为此，我们在画布中引入了 **紫色聚合节点（AggregatorNode）**，并在后端设计了三种自适应聚合策略：

![打破多路汇聚死锁：变量聚合器契约设计]({{ '/assets/images/aggregator-reconvergence.png' | relative_url }})

```typescript
// src/engine/browser-engine.ts (聚合节点的多模式提取)
case 'aggregator': {
  const config = (node.data.config || {}) as unknown as AggregatorNodeConfig;
  const mode = config.mode || 'first_available';
  let aggregatedValue: unknown = null;

  if (mode === 'first_available') {
    // 模式 1：提取首个未被跳过且产生有效输出的分支数据（互斥分支合并的黄金模式）
    for (const edge of incomingEdges) {
      if (!skippedNodes.has(edge.source) && context[edge.source]) {
        const srcOut = context[edge.source]!;
        aggregatedValue = srcOut['promptText'] ?? srcOut['output'] ?? srcOut['result'] ?? srcOut;
        break;
      }
    }
  } else if (mode === 'merge_all') {
    // 模式 2：将所有活跃上游节点的输出汇聚为一个以 nodeId 为 Key 的统一对象字典
    const merged: Record<string, unknown> = {};
    for (const edge of incomingEdges) {
      if (!skippedNodes.has(edge.source) && context[edge.source]) {
        merged[edge.source] = context[edge.source]!;
      }
    }
    aggregatedValue = merged;
  } else if (mode === 'wait_all') {
    // 模式 3：等待所有分支，若某个分支被跳过，则显式填充为 null 保留键位对齐
    const merged: Record<string, unknown> = {};
    for (const edge of incomingEdges) {
      merged[edge.source] = skippedNodes.has(edge.source) ? null : context[edge.source] ?? null;
    }
    aggregatedValue = merged;
  }

  output = { [config.outputKey || 'result']: aggregatedValue };
  break;
}
```

配合 React Flow 的多端口 Handles，聚合节点的左侧能够同时容纳多条连线插槽，下游节点只需引用 `{{aggregator_1.result}}`，即可天然获得互斥分支计算出的最新数据，彻底消除了下游节点的判断负担。

---

## 五、 核心技术剖析三：连接真实世界——HTTP 请求节点与指数退避弹性

为了让 PatchCat 走出纯文本沙盒，我们落地了科技墨绿配色的 **HTTP 请求节点（HttpNode）**。

在右侧属性抽屉中，我们为其配备了 `Params` / `Headers` / `Body` / `Auth` / `Settings` 五维配置面板。而在运行时底层，AI 搭档强调的**协议防线与指数退避重试**成为了核心代码的灵魂所在：

```typescript
// src/engine/browser-engine.ts (HTTP 执行器安全校验与退避循环)
// 1. 安全防线：强制校验协议白名单，阻断恶意伪协议
if (rawUrl.startsWith('file:') || rawUrl.startsWith('javascript:') || rawUrl.startsWith('data:')) {
  throw new Error(`Security Exception: Forbidden or unsafe URL protocol "${rawUrl}"`);
}

// 2. 构造鉴权头 (Bearer / Basic / Custom API-Key)
if (authType === 'bearer' && authConfig.token) {
  reqHeaders['Authorization'] = `Bearer ${authConfig.token}`;
} else if (authType === 'basic' && (authConfig.username || authConfig.password)) {
  reqHeaders['Authorization'] = `Basic ${btoa(`${authConfig.username}:${authConfig.password}`)}`;
}

// 3. 面对瞬态故障的指数退避重试 (Exponential Backoff)
const retryConfig = config.retryConfig || { maxRetries: 1, retryDelayMs: 1000, retryOn: [500, 502, 503, 504] };
let attempt = 0;

while (attempt <= retryConfig.maxRetries) {
  if (signal.aborted) throw new Error('Workflow execution aborted by user.');

  try {
    const timeoutCtrl = new AbortController();
    const timeoutId = setTimeout(() => timeoutCtrl.abort(), config.timeout || 30000);

    const res = await fetch(targetUrl, { method, headers: reqHeaders, body, signal });
    clearTimeout(timeoutId);

    // 命中 5xx 临时错误码且未达到最大重试次数时，执行指数级退避延迟
    if (!res.ok && retryConfig.retryOn.includes(res.status) && attempt < retryConfig.maxRetries) {
      attempt++;
      const delay = retryConfig.retryDelayMs * Math.pow(2, attempt - 1); // 1s -> 2s -> 4s...
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    const contentType = res.headers.get('content-type') || '';
    const responseData = contentType.includes('application/json') ? await res.json() : await res.text();
    output = { status: res.status, data: responseData, headers: respHeaders };
    break;
  } catch (err) {
    if (attempt >= retryConfig.maxRetries) throw err;
    attempt++;
    await new Promise((r) => setTimeout(r, retryConfig.retryDelayMs * Math.pow(2, attempt - 1)));
  }
}
```

通过这一层自愈机制，即使外部微服务偶发 502 网关超时，工作流也不会瞬间溃败，而是会在后台静默完成退避重试，展现出工业级组件应有的稳健度。

---

## 六、 极端测试与工程实证：构建不可逾越的质量防线

针对本阶段增加的动态分支与图剪枝，我们在 `tests/condition-aggregator.node.test.ts` 与 `tests/http-node.node.test.ts` 中亲自构造了多种极端场景，确保调度底座坚不可摧：

1. **分支互斥与深度穿透测试**：
   构造多级级联分支：`Condition ➔ (Branch A / Branch B) ➔ Downstream Prompt ➔ Downstream LLM`。验证当命中 Branch A 时，Branch B 及其后序的所有深层依赖节点是否全部被正确打上 `NODE_SKIPPED` 标签，并且没有产生多余的空变量输出。
2. **汇聚节点孤儿合流测试**：
   故意构造所有分支全部未命中的异常边界，验证 `AggregatorNode` 能否安全降级为空字典或安全捕获，而不是触发死锁挂起。
3. **恶意伪协议注入防御测试**：
   向 `HttpNode` 注入 `file:///etc/passwd` 与 `javascript:alert(1)`，验证安全断言是否能精准拦截并抛出预期的 `Security Exception`。

经过严格打磨，工程单元测试总数由上一阶段的 77 个扩充至 **94 个纯前端单元测试**，持续保持 **100% 测试通过率**。

---

## 七、 总结与下期预告

在本篇中，我们完成了一次核心计算大脑的关键突围：
- 将简单的静态 DAG 拓扑引擎改造为支持 **IF/ELSE 条件分支与动态分支剪枝** 的成熟图调度器；
- 引入 **变量聚合器（Aggregator）** 完美化解了多分支汇流死锁的算法难题；
- 通过 **HTTP 弹性请求节点** 构筑了向真实网络生态延伸的安全通道。

至此，PatchCat 的底层逻辑和图计算能力已经趋于完备。但另一个关键问题随之而来：
> **我们在画布上配好了如此强大的工作流，难道每次都要点画布的 Run 按钮、在底层日志里找报错吗？**  
> **配置完成的复杂 Agent，如何才能像 Dify 一样一键发布成生产微服务 API，供外部的前端或自动化程序无缝调用？**

在下一篇 **《开源系列 07》** 中，我们将深入剖析 PatchCat 在交互体验与生产交付上的最后一公里攻坚：**即时对话调试抽屉（快捷键 `Ctrl+Shift+D`，支持 SSE 逐字打字机与节点耗时瀑布流追踪）与一键发布生产 REST API 实战！**

---

### 开源致谢与同行交流
PatchCat 能够在业余时间持续演进，离不开开源社区的养分，更离不开 AI 结对搭档的严谨守护。由于个人能力和精力和有限，架构设计中难免有待商榷之处，诚邀各位资深架构师与前端/图计算专家 [前往 GitHub 仓库](https://github.com/GuoBug/PatchCat) 提出 Issue 与 PR，欢迎交流、指正与共同进步！
