Last Updated: 2026-10-22

# Guo Qiang (GuoBug)

**Product Engineer · AI Product Manager / Agent Runtime & Workflow Systems Lead**  
Shanghai, China · Remote (All-Remote) | Email: [gu0bug0@gmail.com](mailto:gu0bug0@gmail.com) | [GitHub](https://github.com/GuoBug) | [Personal Workspace](https://guobug.github.io) | [Interactive Profile](https://guobug.github.io/about/)

---

## Profile & Architectural Positioning

I am a senior **Product Engineer** & **AI Product Manager** blending platform engineering foundations with commercial growth mechanics. Over a 14-year career evolution, I have navigated low-level systems programming, high-concurrency mobile growth, enterprise SaaS platform leadership, and hands-on deterministic AI engineering.

Previously served as Senior Product Manager at **JiHu GitLab (CN)**, leading product strategy, multi-tenant risk governance, and PLG growth for the China SaaS platform. Prior to that, scaled high-concurrency architectures and core growth funnels at **Bilibili** and **Ctrip**. Began my career in commercial banking core systems, building deep intuition for C, DB2, and Linux kernel memory models.

In the AI era, I practice **AI Pair Programming** and "Learning by Doing": moving past superficial prompt wrappers toward **production Agent Runtimes**, **client-side DAG engines**, **local-first agentic workflows**, and deterministic architectures. Business workflows define core product boundaries, AI surfaces edge contracts and deadlock hazards, and rigorous stress testing closes the engineering loop.

---

## Core Competency Matrix & ATS Taxonomy

Bridging product strategy with systems engineering for executive talent discovery and technical architecture audits:

| Dimension | ATS & Recruiter Core Taxonomy | Grounded Engineering Primitives | Proof of Work & Verifiable Assets |
| :--- | :--- | :--- | :--- |
| **AI Product & Agent Orchestration** | AI Product Manager / Architect, Agentic Workflows, Browser-Native RAG, Context Engineering, Guardrails, Evaluation & Diagnostics, 0-to-1 Commercialization | Kahn's topological sort scheduling, 500-line client-side BM25 + neural vector hybrid search (RRF), dual-anchor context pruning, F7 semantic conflict gates, McNemar paired statistical testing | [PatchCat Open-Source Workflow Engine](https://github.com/GuoBug/PatchCat) (592 automated tests, React 19 purity) / 26 Architecture Retrospectives |
| **Deterministic Systems & Agent Runtime** | Agent Runtime, DAG State Machine, Fault Tolerance & Resumption, Tool Deadlock Circuit Breaker, Local-First, Data Sovereignty | Reverse-BFS topological checkpoint resumption, ReAct 3-consecutive-call signature circuit breaker, Web Crypto AES-256-GCM vault, IndexedDB v7 canonical SHA-256 DAG Diff | PatchCat Runtime Core, commercial banking core C code & Linux kernel roots |
| **Commercial Growth & SaaS Governance** | SaaS Product Lead, PLG Onboarding Optimization, GTM Strategy, Multi-Tenant Governance, High Concurrency (65M+ QPS), OpenAPI SDKs | JiHu GitLab China SaaS full-lifecycle risk governance & compliance, self-hosted product telemetry (+8% onboarding completion), Ctrip / Bilibili mobile growth funnels | JiHu GitLab 50+ Public Parent Epics & Issues, upstream GitLab Global core merges |

---

## Core Projects

### 1. PatchCat (Client-Side AI Prompt Flow Orchestrator & Agent Runtime) | 2024.09 – Present | 0→1 Owner
- **Repository**: https://github.com/GuoBug/PatchCat
- **Live Interactive Demo**: https://guobug.github.io/PatchCat/
- **Overview**: Architected and delivered a zero-backend, Local-First AI workflow orchestrator from scratch. Shipped 592 automated unit and integration tests across 172 test suites with strict React 19 purity compliance, accompanied by 26 in-depth architectural retrospectives.
- **Agent Runtime Execution Core**:
  - Implemented client-side directed acyclic graph (DAG) topological sorting and wavefront concurrency matrices via Kahn's algorithm; engineered static AST reachability analysis to intercept cycle deadlocks and orphan dependencies before runtime.
  - Constructed adaptive reverse-BFS topological checkpoint resumption: combining immutable JSON state snapshots with localized ancestor re-sorting to achieve zero-token, zero-latency execution resumption.
- **Tool Sandbox & Deadlock Circuit Breaker**:
  - White-box intercepted ReAct agent polling deadlocks by tracking tool invocation signatures (`callSig = ${toolName}:${toolArgsStr}`). Injected soft corrective reflection prompts at call #2, and tripped a hard circuit breaker at consecutive call #3 to definitively eliminate token bleeding and infinite loops.
- **Zero-Backend Hybrid Retrieval (BM25 + Neural Embeddings + RRF)**:
  - Authored a 500-line zero-dependency TypeScript BM25 search engine with dictionary-free CJK bi-gram tokenization and smoothed Robertson-Spärck Jones non-negative IDF.
  - Paired with an in-browser Web Worker running quantized BGE-small ONNX neural embeddings; deployed parameter-free Reciprocal Rank Fusion (RRF, k=60) to bridge exact identifier blind spots (`DAG_CYCLE_DETECTED`) with semantic generalization, achieving sub-50ms latency with 100% client data sovereignty.
- **Context Engineering & Dual-Anchor Pruning**:
  - Engineered an atomic transaction pruning pipeline: pinned `messages[0]` and `messages[1]` as immutable dual anchors to guarantee 100% cloud prompt prefix caching and zero goal drift; encapsulated tool calls into atomic interaction turns to prevent ChatML HTTP 400 crashes.
- **Client-Side Data Sovereignty & Structural DAG Diff**:
  - Replaced plaintext LocalStorage with native Web Crypto API (SubtleCrypto AES-256-GCM + PBKDF2 with 600,000 SHA-256 iterations) to isolate API credentials.
  - Upgraded IndexedDB to v7 with canonical SHA-256 topological hashing invariant to layout noise, implementing 2D LCS line-level structural diffing with atomic rollbacks.

---

## Work Experience & Professional Trajectory

### Miaoawu Tech Studio · PatchCat Open-Source Project | Co-founder / AI Product Manager & Lead Builder | 2024.09 – Present
- Led 0-to-1 product architecture and delivery of PatchCat, an open-source browser-native Agent workflow runtime;
- Engineered enterprise automation pipelines for multi-channel commerce, using deterministic DAG state machines, client-side RAG, and execution sandboxes to achieve reliable business automation;
- Abstracted and open-sourced the underlying workflow runtime to advance client-side agent architectures.

### JiHu (GitLab) | Product Specialist / Head of SaaS & Platform Products | 2022.02 – 2024.09
- Owned product planning, roadmap prioritization, and GTM strategy for GitLab China SaaS in an all-remote international open-source environment;
- **Platform Trust & Safety Governance (Parent Epic #5398)**: Architected multi-tenant risk governance initiative, including mobile registration (#2287), virtual email defense (#2506), resource creation sandboxing (#2508), and explicit privacy consent (#5453);
- **SaaS Telemetry & Product Analytics (Core Epic #5319)**: Spearheaded self-hosted PostHog deployment with decoupled asynchronous replication pipelines (#2672 / #2735);
- **PLG Onboarding & Full-Funnel Growth**: Overhauled interactive trial onboarding labs, driving enterprise onboarding completion rates up by +8%+;
- **Global Upstream Core Merges**: Coordinated localized billing specifications back into the upstream GitLab Global codebase (#2578).

### Shanghai Xianze Analytical Instruments | Software & Platform Product Lead | 2019.08 – 2022.02
- Led product architecture for high-precision optical spectrometry workstation software and laboratory SaaS data platforms;
- Delivered full-stack industrial software and hardware integration—from STM32 registers, oscilloscopes, and serial protocols to C# .NET desktop workstations, establishing Jira agile methodologies.

### Ctrip · Bilibili · Alo7 | Mobile Product Lead / Growth Hacker | 2014 – 2019
- **Ctrip (携程)**: Spearheaded Deferred Deep Linking and mobile attribution across 4 business units, boosting order conversion by 70%~80%; designed marketing automation APIs and real-time dashboards;
- **Bilibili (哔哩哔哩)**: Overhauled mobile web (H5) platform architecture (+80% Avg PV, +100% native app install conversion), proactively embedding channel telemetry and identifying pirated video stream leaks.

### Commercial Banking Data Core Platform | Systems Software Engineer | 2012 – 2014
- Developed core transaction aggregation and batch cutover pipelines (IBM DB2, C, PL/SQL, financial messaging middleware);
- Grounded in Linux 0.11 kernel memory models, building lifelong reverence for production fault tolerance and "configuration as contract".

---

## Technical Focus & Engineering Inquiry

- **Agent Runtime & Deterministic Workflows**: Kahn's topological sort, wavefront concurrency, ReAct watchdogs, reverse-BFS checkpoint resumption, state machine contracts.
- **Local-First & Browser-Native AI**: In-browser neural embedding inference (ONNX Web Workers), zero-dependency client BM25, tri-modal RRF hybrid retrieval, Web Crypto vaults.
- **Context Engineering & Evaluation**: Cloud prompt prefix caching, dual-anchor transaction pruning, F7 semantic conflict gates, dual-axis orthogonal failure taxonomies, McNemar statistical tests.
- **Enterprise Platform & Growth**: Multi-tenant risk and safety governance, self-hosted product telemetry, PLG trial onboarding funnels, upstream open-source governance.

---

## Featured Architecture Essays

- [《Zero-Backend AI: Running Local Embeddings, BM25, and Hybrid RRF Search 100% in the Browser》](https://guobug.github.io/posts/2026/10/18/zero-backend-browser-native-hybrid-search-bm25-rrf/)
- [《Visual Guide to True AI-Native Applications: Deconstructing Architecture Patterns with PatchCat》](https://guobug.github.io/posts/2026/10/09/visual-guide-to-ai-native-applications-and-architecture/)
- [《Building a Client-Side DAG Runtime with Kahn's Algorithm》](https://guobug.github.io/posts/2026/09/21/building-a-client-side-dag-runtime-with-kahns-algorithm/)
- [《PatchCat Season 1 Finale: Local-First AI Workflow Orchestrator Full Blueprint & Field Notes》](https://guobug.github.io/posts/2026/10/18/patchcat-season-1-finale-local-first-orchestrator-architecture/)
- [《Agent Deadlock Interception: Soft Reflection and Hard Circuit Breakers for 3-Consecutive Identical Tool Calls》](https://guobug.github.io/posts/2026/10/01/ai-prompt-orchestrator-agent-deadlock-and-circuit-breaker/)
- [《DAG Checkpoint Resumption: Deterministic Breakpoint Recovery via Reverse-BFS Topological Backtracking》](https://guobug.github.io/posts/2026/09/30/ai-prompt-orchestrator-dag-checkpoint-and-reverse-bfs/)
- [《Context Engineering: Dual-Anchor Sliding Windows and Atomic Transaction Pruning in Agent Loops》](https://guobug.github.io/posts/2026/09/29/ai-prompt-orchestrator-context-engineering-dual-anchor-pruning/)
