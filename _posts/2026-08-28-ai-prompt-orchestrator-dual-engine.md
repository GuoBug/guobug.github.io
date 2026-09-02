---
layout: post
title: "从 0 到 1 打造 AI 提示流编排器：双引擎架构与纯前端 DAG 实践（开源系列 01）"
date: 2026-08-28 01:00:00 +0800
categories: [AI, Architecture, Engineering]
summary: "从单次 Prompt 迷思走向确定性工作流，深入剖析轻量级 AI 提示流编排器的系统架构设计、双引擎适配器（纯前端 Client-Only 与本地 FastAPI）与规范先行的 Vibe Coding 实践。"
tags: [AI, Prompt Engineering, DAG, Workflow, React Flow, Vibe Coding, Open Source]
---

在过去一年多的大模型应用落地探索中，很多初学者乃至产品技术团队都会陷入一个误区：**试图通过一段数千字的“万字神级 Prompt”去解决所有复杂的业务诉求。**

但在真实的生产环境中，单一 Prompt 的脆弱性极其明显：
* **上下文相互污染**：长 Prompt 中各类规则互相干扰，模型顾此失彼；
* **调试宛如开盲盒**：出现 Badcase 时，根本无法定位究竟是哪一句指令引发了幻觉；
* **成本与延迟失控**：简单任务也被迫带着万字上下文使用最贵的大模型，ROI 极低。

**大模型应用落地的本质，是从“单次概率调用”走向“确定性工程系统”。**

市面上虽然已有 Dify、Langflow 等优秀工具，但它们普遍依赖重型后端环境与复杂数据库。为了彻底吃透 Agentic Workflow 底层调度机制，并探索一种**无需后端即可在线体验、本地又能直连私有算力**的极简架构，我启动了这个开源项目：**从产品与架构视角出发，通过“规范先行”的 Vibe Coding，构建一个轻量级低代码 AI 提示流编排器（AI Prompt Flow Orchestrator）。**

<!-- 封面图配置：当前页面使用白底新野兽派封面 (ai-prompt-orchestrator-cover.jpg)；后续如支持夜间模式，可切换为深色点阵封面 (ai-prompt-orchestrator-cover-dark.jpg) -->
![AI Prompt Orchestrator 提示流编排器]({{ '/assets/images/ai-prompt-orchestrator-cover.jpg' | relative_url }})

---

## 一、 为什么单次 Prompt 无法胜任复杂业务？

单次对话调用与工作流编排的核心差异在于**“确定性控制”与“系统可观测性”**：

```text
【传统单次 Prompt（黑盒与概率）】
用户输入 ──> [ 超长 Context + 复合规则指令 ] ──> 大模型 ──> 脆弱且不可控的输出

【提示流编排 DAG Flow（工程化与确定性）】
用户输入 ──> [ 意图分类节点 ] ──> [ 变量抽取 ] ──> [ 垂类推理节点 ] ──> [ Critic 质检节点 ] ──> 确定性交付
                                                           │
                                                           └──> (质检未通过？精准重试该节点)
```

通过 DAG（有向无环图）工作流编排，系统在工程层面实现了四个跃升：

1. **上下文按需隔离**：复杂任务拆解为原子步骤。上游清洗的数据只向特定下游节点透传必要字段，彻底告别“全量历史挤占 Context Window”导致的注意力衰减。
2. **异构模型路由（成本与延迟双降）**：在意图分类、格式清洗等前置节点使用毫秒级响应的轻量模型；在核心生成环节路由给深度推理模型。在实测业务流中，**综合推理成本可降低 50%~70%，响应延迟大幅缩减**。
3. **断言与防线把控（Guardrails & Critic）**：在节点间插入校验逻辑与反思节点，前序输出不合规时立即在局部拦截或触发重试，避免错误向整条链路扩散。
4. **全链路可观测性（Observability）**：每个节点的输入/输出、耗时、Token 消耗均具备独立日志与状态打点，排查 Badcase 精确到毫秒和具体算子，告别盲目全量调优。

---

## 二、 产品形态与“双引擎适配器”架构设计

为平衡**“开源零门槛试用”**与**“生产级扩展能力”**，本项目在初期就确立了**双引擎适配器（Dual-Engine Adapter）**架构：

```text
┌────────────────────────────────────────────────────────────────────────┐
│                     Web UI 画布层 (React Flow + Zustand)               │
│          统一的可视化交互、节点连线、变量插槽抽取与运行状态流转面板            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                        [ Execution Adapter 统一契约 ]
                                    │
         ┌──────────────────────────┴──────────────────────────┐
         ▼                                                     ▼
  【 浏览器端纯前端引擎 (Client-Only) 】                 【 本地服务端引擎 (FastAPI) 】
  • 部署方式：GitHub Pages 纯静态托管                   • 部署方式：本地 Docker / Python
  • 核心调度：纯 TS 实现 DAG 拓扑排序 (Kahn 算法)       • 脚本执行：真实 Python 沙箱安全运行
  • 体验模式：内置丰富 Mock 模板 (零门槛免 Key)         • 模型直连：Ollama 本地私有模型免配置
  • 真实调用：支持浏览器端直连 LLM API (BYOK)          • 数据存储：本地 SQLite / 向量知识库
```

### 1. 体验层（零成本极速体验）
* **痛点**：90% 的开发者看到开源项目时，会因为需要配 Python 环境、装 Docker、找 API Key 而放弃尝试。
* **解法**：基于 GitHub Pages 实现纯前端引擎。访问网页即是一个完整的单页编排应用，内置 Mock 数据流与 Kahn 拓扑调度算法，**无需任何后端即可体验完整的节点流转、分支路由与变量注入**。

### 2. 算力层（全功能深度扩展）
* 本地启动轻量级 FastAPI 服务后，一键切换为本地执行引擎。
* 支持真实的 Python 脚本节点沙箱执行、本地 Ollama 私有模型无缝调用，以及本地知识库 RAG 检索。

---

## 三、 规范先行：Vibe Coding 时代的工程约束

很多人在使用 AI 协作编程（Vibe Coding）时容易陷入“越写越乱、代码腐化”的陷阱。我们的核心原则是：**在敲下第一行代码前，用清晰的 PRD、Schema 规范与架构决策记录（ADR）锁定 AI 编码的边界。**

目前项目的整体工程骨架已落地如下：

```text
ai-prompt-orchestrator/
├── docs/                     # 架构与规范先行
│   ├── 01-prd/               # PRD: 画布交互、DAG 引擎、双模适配规格书
│   ├── 02-architecture/      # 架构: 核心 Graph JSON Schema、状态机设计
│   ├── 03-api/               # 接口: OpenAPI 规范与执行器接口契约
│   └── 04-dev-notes/         # 决策: ADR 选型评估（React Flow、双引擎权衡）
├── src/                      # 纯前端核心工程
│   ├── components/           # 画布、自定义节点 (Input / Prompt / LLM / Code / Output)
│   ├── engine/               # 拓扑排序、环检测、{{var}} 变量解析与调度器
│   ├── stores/               # Zustand 全局图拓扑与运行时状态机
│   └── presets/              # 预设业务场景模板 (客服路由、研报反思等)
└── .github/workflows/        # GitHub Actions 自动化 CI/CD (Pages 一键发布)
```

通过将 **Graph Schema（节点、连线、数据协议）** 严格类型化，AI 生成的代码被严格限制在类型系统的沙盒内，大幅降低了大型 Refactor 时的逻辑断层。

---

> 💡 **项目开源与交流**：如果你对前端图计算、轻量级 AI 工作流编排或 Vibe Coding 实践感兴趣，欢迎访问项目仓库并点个 **Star ⭐️** 支持！如果有任何建议或 Bug，欢迎直接在 GitHub 提交 Issue 或 PR 交流。
>
> 🔗 **GitHub 仓库地址**：[https://github.com/gu0bug/ai-prompt-orchestrator](https://github.com/gu0bug/ai-prompt-orchestrator)  
> 📖 **下一篇深度解析**：[《从 0 到 1 打造 AI 提示流编排器：Kahn 拓扑排序、安全变量引擎与异步运行时实战（开源系列 02）》]({{ '/posts/2026/08/28/ai-prompt-orchestrator-kahn-runtime/' | relative_url }})

