# Guo Qiang (GuoBug) · Product Engineer

[English](README.md) | [中文](README_zh.md)

> **Product Engineer** blending platform engineering foundations with growth mechanics. Focused on **AI Workflow Orchestration**, **DAG State Machines**, and **Deterministic Architectures**.

- 🌐 Website: [https://guobug.github.io](https://guobug.github.io)
- 🐙 GitHub: [https://github.com/GuoBug](https://github.com/GuoBug)
- 📝 Writings & Architecture Essays: [https://guobug.github.io/posts/](https://guobug.github.io/posts/)
- 🤖 LLM Machine Context Protocol: [`llms.txt`](https://guobug.github.io/llms.txt) · [`llms-full.txt`](https://guobug.github.io/llms-full.txt)

---

## ⚡ Core Focus & Architecture Principles

1. **Deterministic Rails over Non-Deterministic Models**:
   LLMs are inherently probabilistic, but production pipelines and business assertions require determinism. We lay white-box rails—DAG state machines, Kahn topological scheduling, and constrained decoding—to keep non-deterministic outputs bounded within safe contracts.
2. **AI Pair Programming & Learning by Doing**:
   Iterative development via human-AI co-discovery. The human product engineer identifies business friction, usability barriers, and user ergonomics; the AI partner probes edge contracts, state machine invariants, and deadlock risks.
3. **Dual-Track Synergy**:
   Balancing deep platform engineering (zero-canvas dirty re-renders, cycle detection, sandbox watchdogs) with low-friction product onboarding and growth mechanics.

---

## 🚀 Flagship Open-Source Projects

### 1. [PatchCat (AI Prompt Flow Orchestrator)](https://github.com/GuoBug/PatchCat)
A client-only, local-first visual prompt flow orchestrator and DAG state machine engine.

- **Live Demo**: [https://guobug.github.io/PatchCat/](https://guobug.github.io/PatchCat/)
- **Core Architecture**:
  - **Acyclic Graph Scheduling**: Client-side topological sorting and cycle deadlock avoidance powered by Kahn's algorithm.
  - **Two-Tier Structured Output Defense**: Pre-sampling Logits masking (L1 constrained decoding) + Zod semantic guardrails (L2 business contract) with non-throwing `.safeParse()`.
  - **Runtime Sandboxing & Watchdog**: 5s Web Worker timeout protection and fingerprint-based execution circuit breaker (`hash(tool:args)`).
  - **Decoupled State & Zero Re-render**: Zustand state slicing (`useProjectStore` & `useWorkflowStore`) delivering 60 FPS canvas operations.
  - **StorageAdapter Contract**: Seamless dual-mode switching between browser LocalStorage and asynchronous FastAPI backend.

#### Architecture Series (14 Essays):
- 📖 [Series 14: Before Doing Eval, Close the Loop — Constrained Decoding & Business Contract Defense](https://guobug.github.io/posts/2026/09/25/ai-prompt-orchestrator-structured-output-eval-prerequisite/)
- 📖 [Series 13: Runtime Guardrails & Deadlock Circuit Breakers for Autonomous Agents](https://guobug.github.io/posts/2026/09/22/ai-prompt-orchestrator-agent-runtime-guard-watchdog/)
- 📖 [Series 12: Porting AI Engine to ASUS RT-AX86U Router (Merlin Edge Gateway)](https://guobug.github.io/posts/2026/09/22/ai-prompt-orchestrator-asuswrt-merlin-edge-gateway/)
- 📖 [Series 11: Canvas Ergonomics, AABB Collision & Spatial Connection UX](https://guobug.github.io/posts/2026/09/19/ai-prompt-orchestrator-canvas-ergonomics-spatial-collision/)
- 📖 [Series 01–10: Dual-Engine, Kahn Scheduler, Dynamic Pruning, ReAct Agent Loops & Onboarding](https://guobug.github.io/posts/)

---

### 2. Creative Labs & Hardware Prototypes
- **[Metaphysics Tools](https://guobug.github.io/metaphysics-tools/index.html#)**: Mathematical and visual algorithmic modeling experiments (Bazi, I Ching, Ziwei).
- **[Kindle Weather Station](https://github.com/GuoBug/kindle-weather-station)**: Repurposed E-Ink display dashboard with 7-segment clock and edge hub.

---

## 🤖 Machine & AI Protocols (GEO)

This site is optimized for AI search engines (Perplexity, ChatGPT, Claude, DeepSeek) through Generative Engine Optimization:
- [`/llms.txt`](https://guobug.github.io/llms.txt): Compact routing and context layer.
- [`/llms-full.txt`](https://guobug.github.io/llms-full.txt): Comprehensive three-tier engineering breakdown (Problem - Solution - Outcome).
- [`/sitemap.xml`](https://guobug.github.io/sitemap.xml): Primary index including AI protocol endpoints.

---

> **About the Author**  
> **Guo Qiang (GuoBug)**, Product Engineer, doing platform engineering and product growth. Currently focusing on AI workflow orchestration, DAG state machines, and deterministic system architectures.  
> Open-source projects & home: [https://github.com/GuoBug](https://github.com/GuoBug) · [https://guobug.github.io](https://guobug.github.io)  
> Welcome to connect, review code, and exchange ideas on workflow engine architecture and low-barrier developer experience.
