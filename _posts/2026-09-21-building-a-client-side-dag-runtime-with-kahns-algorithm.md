---
layout: post
title: "Building a Client-Side DAG Runtime with Kahn's Algorithm"
title_en: "Building a Client-Side DAG Runtime with Kahn's Algorithm"
date: 2026-09-21 14:00:00 +0800
categories: [Algorithms, Architecture, Engineering]
pub_tag: "DAG Engine"
math: true
summary: "How to build a high-performance, browser-native DAG workflow execution engine using Kahn's topological sort, safe variable interpolation, and wavefront concurrency."
summary_en: "How to build a high-performance, browser-native DAG workflow execution engine using Kahn's topological sort, safe variable interpolation, and wavefront concurrency."
read_time: "14 MIN READ"
tags: [Algorithms, TypeScript, AI, Open Source, Kahn Algorithm, Wavefront Concurrency, DAG State Machine, Product Engineer, PatchCat]
series: "PatchCat · AI Prompt Flow Orchestrator"
---

> TL;DR: I built a client-side DAG workflow engine using Kahn's topological sort algorithm for cycle detection, with BYOK architecture and zero backend dependency. This article breaks down the architecture decisions, edge cases, and production testing approach.

---

![Building a Client-Side DAG Runtime with Kahn's Algorithm]({{ '/assets/images/ai-prompt-orchestrator-cover.jpg' | relative_url }})

## 1. Why Run a DAG Workflow Engine in the Browser?

Most modern AI agent orchestration frameworks—such as Apache Airflow, Dify, and LangGraph—rely heavily on heavyweight server-side infrastructure: Docker containers, PostgreSQL databases, Redis queues, and Python worker runtimes. 

While that works for enterprise cluster deployments, it introduces significant friction for personal developer tools and edge computing:
1. Setup Fatigue: Developers spend 30 minutes debugging container networks and environment variables before typing their first prompt.
2. Privacy & Credential Risks: Passing proprietary API keys and sensitive prompts through third-party cloud relays creates compliance and security liabilities.
3. Latency Overhead: Every node transition incurs network round-trip hops between client canvas and cloud orchestrators.

As a **Product Engineer**, my goal with [PatchCat](https://github.com/GuoBug/PatchCat) was clear: build a zero-install, privacy-first **AI Workflow Orchestration** system that runs 100% inside the browser via GitHub Pages. Users bring their own keys (BYOK), API keys never touch any intermediary server, and the entire dependency graph resolves right inside client-side memory.

```
┌────────────────────────────────────────────────────────┐
│               Browser Client Memory (BYOK)              │
│                                                        │
│  ┌──────────────┐     ┌──────────────┐                 │
│  │ User Inputs  │ ──> │ Visual Canvas│                 │
│  └──────────────┘     └──────┬───────┘                 │
│                              │ JSON Graph Spec         │
│                              ▼                         │
│             ┌─────────────────────────────────┐        │
│             │  In-Browser Kahn DAG Runtime    │        │
│             │  - Pre-flight Cycle Detection   │        │
│             │  - Wavefront Concurrency Matrix │        │
│             │  - AST Safe Variable Extraction │        │
│             └────────────────┬────────────────┘        │
│                              │ Direct Sandboxed Fetch  │
│                              ▼                         │
└──────────────────────────────┼─────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   OpenAI / DeepSeek / Gemini               Local Ollama
```

However, running a visual graph executor in JavaScript introduces severe systems engineering challenges:
- How do you infer the exact execution sequence from arbitrary visual dragging in sub-milliseconds?
- How do you maximize parallel I/O throughput across heterogeneous LLMs without blocking on serial steps?
- How do you prevent prototype pollution when dynamically extracting nested variables like `{{node_1.data.items[0].id}}`?
- How do you intercept circular dependency deadlocks before spending token quotas?

To solve this, I partnered with AI coding agents in a Milestone Co-Discovery pair-programming workflow: I drove the user experience constraints, zero-backend BYOK model, and boundary ergonomics; the AI challenged the underlying graph theory boundaries, identified race conditions, and surfaced deadlock edge cases.

Here is the exact architectural breakdown of the resulting engine.

---

## 2. Milestone 1: Layer-by-Layer Topological Sort (Wavefront Concurrency)

### The Limitation of Standard Topological Sort
Standard topological sorting algorithms (like classic DFS-based sorting) output a flat, one-dimensional array:

```
[Node_A, Node_B, Node_C, Node_D]
```

If `Node_B` and `Node_C` are both downstream of `Node_A` but completely independent of each other, a flat list forces the executor to run them sequentially. When calling LLM endpoints with 2–5 second latencies, sequential execution cuts throughput in half.

### The Solution: Wavefront 2D Execution Matrix
Kahn’s algorithm operates on in-degree elimination. By tracking in-degrees layer by layer, we can partition the graph into discrete, causal Wavefront Layers:

```
Execution Layers = [
  [Node_A],
  [Node_B, Node_C],
  [Node_D]
]
```

All nodes within the same layer have zero mutual topological dependencies and can be dispatched concurrently via `Promise.all`.

```typescript
export interface GraphNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface TopoSortResult {
  layers: string[][]; // 2D Wavefront concurrency matrix
  hasCycle: boolean;
  cycleNodes: string[];
}

/**
 * Computes parallel execution layers using Kahn's algorithm.
 * Time Complexity: O(|V| + |E|)
 * Space Complexity: O(|V| + |E|)
 */
export function computeExecutionLayers(
  nodes: GraphNode[],
  edges: GraphEdge[]
): TopoSortResult {
  const inDegree = new Map<string, number>();
  const adjacencyList = new Map<string, string[]>();

  // 1. Initialize data structures
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacencyList.set(node.id, []);
  }

  // 2. Build adjacency list and calculate incoming degrees
  for (const edge of edges) {
    if (!inDegree.has(edge.target) || !adjacencyList.has(edge.source)) {
      continue; // Skip invalid or dangling edges
    }
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    adjacencyList.get(edge.source)!.push(edge.target);
  }

  // 3. Extract Level-0 seed nodes (in-degree == 0)
  let currentLayer: string[] = [];
  for (const [nodeId, deg] of inDegree.entries()) {
    if (deg === 0) {
      currentLayer.push(nodeId);
    }
  }

  const layers: string[][] = [];
  let visitedCount = 0;

  // 4. Wavefront iterative reduction
  while (currentLayer.length > 0) {
    layers.push(currentLayer);
    visitedCount += currentLayer.length;
    const nextLayer: string[] = [];

    for (const nodeId of currentLayer) {
      const neighbors = adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        const updatedDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, updatedDegree);
        if (updatedDegree === 0) {
          nextLayer.push(neighbor);
        }
      }
    }
    currentLayer = nextLayer;
  }

  // 5. Cycle Detection
  const hasCycle = visitedCount !== nodes.length;
  const cycleNodes: string[] = [];
  if (hasCycle) {
    for (const [nodeId, deg] of inDegree.entries()) {
      if (deg > 0) {
        cycleNodes.push(nodeId);
      }
    }
  }

  return { layers, hasCycle, cycleNodes };
}
```

---

## 3. Milestone 2: Pre-flight Semantic Validation & Deadlock Interception

Visual node editors give users complete freedom. Users frequently:
1. Delete upstream nodes while leaving edges floating (Dangling Edges).
2. Wire outputs back to ancestor nodes (Cyclic Deadlocks).

In a naive engine, a cyclic dependency causes the runtime to hang forever or crash with `TypeError: Cannot read properties of undefined`.

### Fail-Fast Pre-flight Check
By leveraging Kahn’s theorem, we turn cycle detection into a static sanity check that executes in sub-millisecond time (< 0.2ms) before making network calls:

```typescript
export interface ValidationIssue {
  type: 'DANGLING_EDGE' | 'CYCLIC_DEPENDENCY';
  message: string;
  affectedIds: string[];
}

export function validateWorkflowGraph(
  nodes: GraphNode[],
  edges: GraphEdge[]
): { isValid: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Check 1: Dangling Edges
  const danglingEdges = edges.filter(
    (e) => !nodeIds.has(e.source) || !nodeIds.has(e.target)
  );

  if (danglingEdges.length > 0) {
    issues.push({
      type: 'DANGLING_EDGE',
      message: `Found ${danglingEdges.length} dangling edge(s) referencing missing nodes.`,
      affectedIds: danglingEdges.map((e) => e.id),
    });
  }

  // Check 2: Cycle Detection via Kahn's reduction
  const topo = computeExecutionLayers(nodes, edges);
  if (topo.hasCycle) {
    issues.push({
      type: 'CYCLIC_DEPENDENCY',
      message: `Workflow contains circular dependencies. Nodes cannot be scheduled.`,
      affectedIds: topo.cycleNodes,
    });
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}
```

When circular dependencies are detected, the visual UI immediately highlights the offending nodes in red, halting execution before a single prompt is dispatched.

---

## 4. Milestone 3: Safe Variable Path Traversal & Prototype Pollution Defense

AI workflow steps require dynamic variable interpolation. For example, a downstream Prompt node needs values produced by an upstream Webhook or HTTP node:

```mustache
Analyze this user query: {{http_1.response.data.users[0].query}}
Fallback context: {{knowledge_node.summary | "No context available"}}
```

### The Security Trap: Prototype Pollution
Dynamic path extraction often uses naive string splitting or recursive lookups. In a multi-tenant or shared template environment, malicious templates could specify paths like:

`__proto__.polluted = "true"` or `constructor.prototype.isAdmin = true`

If an untrusted workflow modifies `Object.prototype`, the entire client runtime is compromised.

### The Hardened Accessor: `getNestedProperty`
We engineered a hardened property accessor with prototype blocking and unified path parsing (supporting both dot and bracket notation):

```typescript
const FORBIDDEN_PROPERTIES = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/**
 * Safely extracts deep properties from arbitrary objects without prototype poisoning risks.
 */
export function getNestedProperty(
  obj: unknown,
  path: string
): unknown {
  if (!obj || typeof obj !== 'object' || !path) {
    return undefined;
  }

  // Normalize path: convert a[0].b -> a.0.b
  const normalizedPath = path
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/^\./, '');
  
  const tokens = normalizedPath.split('.');
  let current: any = obj;

  for (const token of tokens) {
    if (current == null) {
      return undefined;
    }

    // Security Gate: Reject prototype pollution attempts
    if (FORBIDDEN_PROPERTIES.has(token)) {
      console.warn(`[Security Alert] Blocked attempt to access prototype property: ${token}`);
      return undefined;
    }

    current = current[token];
  }

  return current;
}
```

### Fault-Tolerant Dynamic Template Resolver
We then layer dynamic string interpolation on top of `getNestedProperty`, with pipe fallback support (`|`) and automatic JSON serialization:

```typescript
/**
 * Resolves template placeholders: {{nodeId.path | fallback}}
 */
export function resolveTemplateVariables(
  template: string,
  context: Record<string, unknown>
): string {
  if (!template) return '';

  const regex = /\{\{\s*([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_.[\]]+)(?:\s*\|\s*([^}]+))?\s*\}\}/g;

  return template.replace(regex, (match, nodeId, propPath, fallbackRaw) => {
    const nodeOutput = context[nodeId];
    const resolvedValue = getNestedProperty(nodeOutput, propPath);

    if (resolvedValue !== undefined && resolvedValue !== null) {
      if (typeof resolvedValue === 'object') {
        return JSON.stringify(resolvedValue);
      }
      return String(resolvedValue);
    }

    // Process fallback
    if (fallbackRaw !== undefined) {
      const trimmedFallback = fallbackRaw.trim();
      // Unquote if string literal
      if (
        (trimmedFallback.startsWith('"') && trimmedFallback.endsWith('"')) ||
        (trimmedFallback.startsWith("'") && trimmedFallback.endsWith("'"))
      ) {
        return trimmedFallback.slice(1, -1);
      }
      return trimmedFallback;
    }

    // Self-healing: preserve original placeholder if unresolvable
    return match;
  });
}
```

---

## 5. Milestone 4: Wavefront Execution Runtime with `AbortController`

With parallel layers and safe variable interpolation established, the execution runtime translates the static schedule into an asynchronous event stream.

### Key Architectural Requirements:
1. Barrier Synchronization: Layer N+1 cannot begin until every node in Layer N has resolved.
2. In-Flight Cancellation: When the user clicks "Stop", pending network requests across all concurrent branches must abort immediately.
3. Observability: Real-time state progress must stream back to update canvas node status indicators.

```typescript
export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

export interface ExecutionEvent {
  nodeId: string;
  status: ExecutionStatus;
  output?: unknown;
  error?: string;
  durationMs?: number;
}

export class WorkflowRuntime {
  private abortController: AbortController | null = null;
  private nodeOutputs = new Map<string, unknown>();

  public async *runWorkflow(
    nodes: GraphNode[],
    edges: GraphEdge[],
    nodeExecutor: (node: GraphNode, context: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>
  ): AsyncGenerator<ExecutionEvent, void, unknown> {
    // 1. Pre-flight Validation
    const validation = validateWorkflowGraph(nodes, edges);
    if (!validation.isValid) {
      throw new Error(`Workflow Validation Failed: ${validation.issues[0].message}`);
    }

    const { layers } = computeExecutionLayers(nodes, edges);
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // 2. Execute Wavefront Layers Sequentially
    for (const layer of layers) {
      if (signal.aborted) {
        break;
      }

      // Execute all nodes within the current wavefront concurrently
      const layerPromises = layer.map(async (nodeId) => {
        const node = nodeMap.get(nodeId)!;
        const startTime = performance.now();

        try {
          const result = await nodeExecutor(
            node,
            Object.fromEntries(this.nodeOutputs.entries()),
            signal
          );
          const durationMs = Math.round(performance.now() - startTime);
          this.nodeOutputs.set(nodeId, result);

          return {
            nodeId,
            status: 'COMPLETED' as ExecutionStatus,
            output: result,
            durationMs,
          };
        } catch (err: any) {
          const durationMs = Math.round(performance.now() - startTime);
          return {
            nodeId,
            status: 'FAILED' as ExecutionStatus,
            error: err?.message || 'Execution failed',
            durationMs,
          };
        }
      });

      // Synchronize wavefront barrier
      const results = await Promise.all(layerPromises);

      for (const event of results) {
        yield event;
        if (event.status === 'FAILED') {
          // Fast-fail: abort downstream execution on fatal error
          this.abortController.abort();
          return;
        }
      }
    }
  }

  public cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
```

---

## 6. Verification: Production Benchmarks & Chaos Testing

To guarantee production resilience, I constructed a comprehensive test suite using the Node.js test runner (`tests/engine.node.test.ts`):

- 26 Assertions across 9 Test Suites: Covering single-node execution, diamond DAGs, wide wavefronts (10+ parallel branches), cyclic dependency traps, and prototype pollution injection vectors.
- Runtime Performance: The complete 26-test engine suite executes in **1,070ms** (with over 360+ automated unit tests across the entire PatchCat codebase).
- Cycle Detection Overhead: Under 100+ simulated nodes, **Kahn's Algorithm** cycle identification consistently takes **0.18ms**, completely invisible to user interactions.

```
✔ Suite 1: Topological Sort (Kahn's Algorithm) (4ms)
✔ Suite 2: Variable Resolver & Prototype Pollution Security (2ms)
✔ Suite 3: Execution Runtime Async Scheduling & Propagation (111ms)
✔ Suite 4: Advanced Engineering Benchmarks & Edge-Case Verification (174ms)
✔ Suite 5: Workflow Zustand Store State Transitions (2ms)
✔ Suite 6: Scenario: E-Commerce Multi-Agent Arbitrator Pipeline (120ms)
✔ Suite 7: Model Resolution & Provider Compatibility (1ms)
✔ Suite 8: Dynamic Code Node & Routing Logic (97ms)
✔ Suite 9: Sandbox Isolation & Watchdog Security (166ms)

Total Engine Tests: 26 passed, 0 failed
Total Project Tests: 364 passed, 0 failed
```

---

## 7. Architectural Takeaways for Product Engineers

1. Algorithms Over Infrastructure: Rather than deploying Celery or Redis queues to coordinate node execution, graph theory algorithms like Kahn's topological sort allow you to build deterministic orchestrators directly on edge clients.
2. Security Must Be Native to String Templating: Dynamic variable syntax looks simple on the surface, but traversal engines must reject meta-properties (`__proto__`, `constructor`) at the lexical level.
3. Product-Led Engineering: Technical users love local-first tools. Eliminating backend requirements reduces operational overhead to zero while creating unmatched privacy guarantees for AI workflows.
4. A Durable Bedrock for Advanced Graphs: Establishing a deterministic, layer-by-layer execution matrix provided the unshakeable foundation for PatchCat's subsequent features—such as dynamic conditional routing and reverse-BFS checkpoint resumption.

---

## FAQ

### What is Kahn's algorithm and why use it for DAG scheduling?
Kahn's algorithm performs topological sorting by iteratively removing nodes with zero in-degree (nodes with no pending dependencies). It has an optimal time complexity of **O(|V| + |E|)**. Unlike standard DFS traversal which returns a linear array, Kahn's algorithm naturally decomposes nodes into discrete, parallelizable **Wavefront Concurrency** layers, allowing the runtime to execute mutually independent tasks concurrently in a client-side **DAG State Machine**.

### How does BYOK work in PatchCat?
Bring Your Own Key (BYOK) means API credentials never leave the browser. The browser directly dispatches requests to LLM APIs (OpenAI, DeepSeek, Anthropic, or local Ollama endpoints) via native fetch and Web Worker sandboxes. Because no server relay is involved, credentials and prompts are never stored or logged on third-party servers.

### How does the runtime handle node failure during wavefront execution?
The runtime implements barrier synchronization using `Promise.all` across each layer. If any node fails or throws an exception, the runtime emits a `FAILED` execution event and immediately signals the internal `AbortController`. This cancels all ongoing network requests across peer nodes in the same wavefront and prevents downstream layers from triggering.

### Why build a browser-based DAG instead of using Python frameworks like LangGraph?
Python server frameworks are ideal for asynchronous, long-running background tasks. However, for interactive prompt experimentation, UI prototyping, and local data workflows, browser-based engines eliminate Docker orchestration overhead, run with zero server cost, and provide instantaneous visual feedback at 60fps.

---

> **关于作者 / About the Author**  
> **郭强 (Guo Qiang / GuoBug)**，Product Engineer，做平台工程也做业务增长。目前主要在折腾 AI 工作流编排、DAG 状态机与确定性系统架构。  
> 开源项目与主页：[https://github.com/GuoBug](https://github.com/GuoBug) · [https://guobug.github.io](https://guobug.github.io)  
> 欢迎就工作流引擎架构、拓扑调度和低门槛开发体验交流指教。
