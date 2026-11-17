---
layout: post
title: "Agent Nodes & Tool Calling in Visual Workflow Engines"
title_en: "Agent Nodes & Tool Calling in Visual Workflow Engines"
date: 2026-11-17 19:20:00 +0800
categories: [AI, Agent, Architecture]
pub_tag: "AI & Agent"
math: false
read_time: "12 MIN READ"
summary: "How PatchCat v0.4.2 adds autonomous ReAct Agent Nodes and three tool modalities (Web Worker JS sandbox, REST API, and canvas node reuse) without polluting a Kahn DAG canvas with spaghetti back-edges, backed by SSE delta.tool_calls fragment buffering and maxIterations watchdogs."
summary_en: "How PatchCat v0.4.2 adds autonomous ReAct Agent Nodes and three tool modalities (Web Worker JS sandbox, REST API, and canvas node reuse) without polluting a Kahn DAG canvas with spaghetti back-edges, backed by SSE delta.tool_calls fragment buffering and maxIterations watchdogs."
tags: [AI Workflow Orchestration, DAG Engine, State Machine, ReAct, Function Calling, Web Worker Sandbox, Kahn Algorithm, PatchCat]
series: "PatchCat · AI Prompt Flow Orchestrator"
---

> **TL;DR**: Visual workflow builders often break down when they allow cyclic back-edges on the canvas to support autonomous agents, turning clean pipelines into unreadable spaghetti graphs. In [PatchCat](https://github.com/GuoBug/PatchCat) **v0.4.2**, we kept the outer **DAG Engine** strictly acyclic under Kahn's topological sort and encapsulated the entire ReAct loop inside a single Agent Node—complete with three tool modalities (`builtin_code`, `builtin_http`, `canvas_node`), an SSE `delta.tool_calls` fragment accumulator, and a hard `maxIterations` watchdog.

> Chinese companion essay: [《从 0 到 1 打造 AI 提示流编排器：给大模型装上手和脚！Agent 节点与 Tools 工具调用体系设计与实战（开源系列 09）》]({{ '/posts/2026/09/13/ai-prompt-orchestrator-agent-tools-reactive-loop/' | relative_url }})

![Agent Nodes and Tool Calling in Visual Workflow Engines]({{ '/assets/images/cover-agent-nodes-tool-calling-en.jpg' | relative_url }})

---

## 1. The Canvas Dilemma: Static Pipelines vs. Dynamic Reasoning

An **AI Workflow Orchestration** engine built on Kahn's topological sort excels at fixed Standard Operating Procedures (SOPs)—intent classification, structured extraction, and multi-model A/B evaluation. Each node runs once in its dependency wave and passes immutable outputs downstream.

That determinism hits a wall as soon as the task's step count is unknown at design time. Consider a simple user prompt:

> *"Convert 450 USD to CNY using today's exchange rate, deduct a 3% cross-border fee, and calculate the net payout."*

A static LLM node faces two bad choices: guess both the live exchange rate and floating-point arithmetic from stale weights, or force the user to wire an overly complex branching graph for every possible tool sequence. To handle open-ended tasks reliably, a workflow needs a **State Machine** that can observe tool outputs and decide its next step at runtime.

In **v0.4.2**, PatchCat bridged this gap by introducing an autonomous Agent Node and a three-tier tool system, built through AI pair programming and a learning-by-doing engineering workflow.

---

## 2. Milestone Co-Discovery: Encapsulating the ReAct Loop

Before writing the runtime, we had to resolve a fundamental graph-design conflict between visual clarity and iterative execution.

### What the Product Engineer Insisted On
Many node-based orchestrators implement agent loops by allowing users to draw backward edges (`Node C -> Node A`) directly on the canvas. In early prototypes, even two or three feedback edges caused crossing wires that turned the canvas into an unreadable spaghetti graph. Users also lost track of which iteration a loop was currently executing.

The product constraint was non-negotiable: the outer canvas must remain a pure, readable DAG scheduled by Kahn's algorithm. All ReAct iterations (`Think -> Act -> Observe`) had to stay encapsulated inside a single Agent Node, with progress surfaced via node badges and the streaming debug drawer. Furthermore, tools could not be limited to raw scripts—an Agent Node needed to invoke existing nodes already wired on the canvas (such as a RAG knowledge retrieval node) without adding extra edges.

### What the AI Pair Partner Flagged
Encapsulating a multi-turn loop inside one node shifts risk from the canvas to the client-side runtime. Three failure modes surfaced immediately during design review:

1. `SSE delta.tool_calls Fragmentation`: Streaming LLM providers emit function names and JSON arguments across multiple incremental chunks. Parsing partial JSON frames directly triggers `Unexpected end of JSON input` crashes.
2. `Hallucination Infinite Loops`: When a tool throws an error or a prompt contains contradictory constraints, an LLM can repeatedly invoke the exact same failing tool call until the user's token budget is exhausted.
3. `Sampling Drift in Tool Arguments`: High temperature values introduce schema violations in generated JSON arguments. Tool-calling nodes should default `temperature` to `0.1–0.3`.

### Engineering Restraint at v0.4.2
After the initial prototype passed local checks, my AI partner suggested bumping the release straight to `v0.5.0`. I overruled that and pinned the milestone to `v0.4.2` instead. Jumping a minor version before stress-testing configuration ergonomics, error boundaries, and real-world tool prompts would have masked fragile assumptions.

![Encapsulated ReAct Loop and 3-Modality Tool Dispatch]({{ '/assets/images/flowchart-agent-nodes-react-loop-en.svg' | relative_url }})

---

## 3. Standard LLM Node vs. Autonomous Agent Node

To keep mental models clear for workflow authors, PatchCat separates single-shot inference from bounded iterative agency:

| Dimension | Standard LLM Node | Autonomous Agent Node |
| :--- | :--- | :--- |
| Execution Model | Single pass: `Prompt -> Inference -> Output` | Bounded ReAct loop: `Think -> Act -> Observe -> ... -> Final Answer` |
| External Capabilities | Relies solely on static model weights | Dispatches `builtin_code`, `builtin_http`, and `canvas_node` tools |
| Canvas Topology | Single static step in a DAG wave | Single black-box task to the outer scheduler; zero back-edges |
| Failure Guardrails | Request timeout and output schema check | `maxIterations` cap, `AbortSignal` cancellation, SSE buffer accumulator |

---

## 4. Three Tool Modalities in PatchCat

Inside the Agent Node's inspector drawer, builders can attach any combination of three tool modalities. Each modality targets a distinct class of LLM weakness.

![PatchCat Three Core Tool Modalities]({{ '/assets/images/agent-tools-three-modalities.png' | relative_url }})

### 1. Sandboxed Code (`builtin_code`)
Autoregressive models are unreliable at floating-point arithmetic, date deltas, and deterministic array transformations. The `builtin_code` modality executes user-defined JavaScript inside an isolated client-side Web Worker, completely stripped of DOM, `localStorage`, and network access:

```typescript
// Isolated Web Worker execution slice for builtin_code tools
const workerScript = `
  self.onmessage = function(e) {
    try {
      const inputs = e.data.inputs || {};
      const run = new Function('inputs', e.data.code);
      self.postMessage({ success: true, result: run(inputs) });
    } catch (err) {
      self.postMessage({ success: false, error: err.message });
    }
  };
`;
```

### 2. External REST API (`builtin_http`)
For live exchange rates, weather telemetry, or internal microservices, `builtin_http` binds a target URL and HTTP method to a typed JSON Schema. When the model emits a tool call, the runtime validates the arguments, executes the `fetch`, and feeds the response back as a standard `tool` role message.

### 3. Canvas Node Reuse (`canvas_node`)
Rather than duplicating RAG knowledge-base configuration inside an Agent Node, `canvas_node` lets the agent invoke any existing node on the same canvas by `nodeId`. When triggered, the engine suspends the Agent Node's execution frame, runs the target node recursively to retrieve context chunks or formatted prompts, and injects the result back into the agent's message history.

---

## 5. Data Flow Contract & End-to-End Execution Trace

To the outer Kahn scheduler, an Agent Node behaves like any other asynchronous node. Upstream inputs enter through double-brace interpolation (`{% raw %}{{input_user.user_query}}{% endraw %}`), and downstream nodes consume three standardized output fields:

- `{% raw %}{{agent_node.response}}{% endraw %}`: The synthesized final Markdown answer.
- `{% raw %}{{agent_node.iterations}}{% endraw %}`: Integer count of ReAct rounds executed (useful for auditing retries).
- `{% raw %}{{agent_node.usage}}{% endraw %}`: Cumulative `prompt_tokens`, `completion_tokens`, and `total_tokens` across all rounds.

In the built-in preset *Autonomous Agent with Tool Calling*, running the 450 USD conversion prompt produces a clean 3-round trace:

1. Think 1: The agent invokes `get_exchange_rate(from='USD', to='CNY')` (`builtin_http` or mock preset) and observes `{ rate: 7.25 }`.
2. Think 2: Instead of doing mental math, it sends `450 * 7.25 * (1 - 0.03)` to the `calculate` Web Worker (`builtin_code`) and observes `{ result: 3164.025 }`.
3. Think 3: With verified inputs in context, it synthesizes the final response and exits cleanly at `Step 3/6`.

---

## 6. Verification, Trade-offs, and Operational Boundaries

![Runtime Watchdog and Web Worker Sandbox Rails]({{ '/assets/images/illustration-agent-sandbox-watchdog-rails.jpg' | relative_url }})

### Automated Edge-Case Verification
In `tests/agent-node.node.test.ts`, we wrote targeted tests covering hostile runtime conditions:
- `Deadlock Watchdog`: Injecting contradictory prompts that force repeated tool failures to verify that `maxIterations: 5` terminates execution cleanly before burning tokens.
- `Extreme SSE Chunk Splitting`: Splitting `delta.tool_calls` JSON payloads into 1–2 character frames to verify 100% intact argument reconstruction.
- `Empty & Malformed Subgraph Inputs`: Passing empty arrays, invalid JSON strings, and negative numbers to iterative sub-flows without crashing the React UI.

All **195 automated tests** in the suite passed in Node.js CI with zero TypeScript strict-mode warnings.

### Real-World Trade-offs & Limits
Encapsulating ReAct inside a browser-native DAG engine carries clear engineering costs:

1. `Web Worker Sandbox Restrictions`: `builtin_code` tools run in a sterile worker without npm package resolution or network access. Complex libraries must be offloaded to an external `builtin_http` endpoint.
2. `Browser CORS Boundaries`: Because PatchCat executes `builtin_http` directly from the user's browser (BYOK, zero backend relay), target APIs must permit cross-origin requests. Calling strict internal APIs without CORS headers requires a local gateway such as EdgeCat or a browser proxy.
3. `Recursive Context Bloat in canvas_node`: Reusing a RAG node inside a multi-turn agent loop appends retrieved text chunks into the conversation history on every call. Without disciplined chunk limits or dual-anchor pruning, token usage scales rapidly across iterations.
4. `Watchdog Threshold Tuning`: Setting `maxIterations` too low (e.g., `2`) aborts legitimate multi-tool chains, while setting it too high (`> 10`) increases worst-case latency and cost when a weak model stalls.

---

## FAQ

### Why encapsulate the ReAct loop inside a single Agent Node instead of drawing loop edges on the canvas?
Kahn's topological sort requires a Directed Acyclic Graph (DAG) to compute execution waves in $O(|V| + |E|)$ time. Allowing visual back-edges breaks acyclicity, introduces visual spaghetti wiring, and complicates cycle detection. Encapsulating the loop inside a single **State Machine** node preserves a clean outer DAG while still supporting bounded iterative reasoning.

### How does PatchCat prevent broken JSON during streaming tool calls?
During SSE streaming, providers send `delta.tool_calls` arguments in fragmented chunks. PatchCat maintains a per-tool-call-index string accumulator that buffers fragments until the stream signals `finish_reason: "tool_calls"`, parsing the complete JSON payload only after assembly.

### What stops an Agent Node from running forever and draining API credits?
Every Agent Node enforces a hard `maxIterations` watchdog (recommended `5–10` rounds), propagates an `AbortSignal` from the UI stop button down to active `fetch` and Web Worker calls, and pairs with `temperature` constraints (`0.1–0.3`) to reduce malformed tool-call retries.

---

*Written by [Guo Qiang](https://guobug.github.io/about/), **Product Engineer** building [PatchCat](https://github.com/GuoBug/PatchCat) — an open-source AI workflow orchestration engine.  
[GitHub](https://github.com/GuoBug/PatchCat) · [Live Demo](https://guobug.github.io/PatchCat/) · [Blog](https://guobug.github.io)*
