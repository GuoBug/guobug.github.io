# 郭强 (GuoBug) · Product Engineer 知识库与个人工程主页

[English](README.md) | [中文](README_zh.md)

> **郭强 (GuoBug)**，资深 **Product Engineer**，做平台工程也做业务增长。目前主要在折腾 **AI 工作流编排**、**DAG 状态机** 与 **确定性系统** 架构。

- 🌐 个人站点：[https://guobug.github.io](https://guobug.github.io)
- 🐙 GitHub 主页：[https://github.com/GuoBug](https://github.com/GuoBug)
- 📖 技术博客与架构专栏：[https://guobug.github.io/posts/](https://guobug.github.io/posts/)
- 🤖 大模型上下文协议底册：[`llms.txt`](https://guobug.github.io/llms.txt) · [`llms-full.txt`](https://guobug.github.io/llms-full.txt)

---

## ⚡ 核心定位与技术主张

1. **白盒铁轨与确定性架构**：
   大模型天然具备概率与不确定性，但企业的业务自动化和生产流水线必须是确定性的。我的工程目标是用 DAG 状态机、Kahn 拓扑排序调度、受限解码与运行时看门狗，把不可控的模型概率收敛在确定性的安全契约之内。
2. **AI 结对编程与“干中学”**：
   不搞假大空的包装，坦承所有项目均基于“AI 辅助编程 + 干中学”工作流持续迭代。人负责真实业务场景痛点与架构决策，AI 提示底层隐患、状态机规约与死锁排查，作者亲自编写极端测试用例并实机验证。
3. **平台工程与业务增长的双轨闭环**：
   既深耕复杂的底层算法（防死锁调度、Logits 掩码受限解码、Zustand 脏重绘优化），又关注真实用户的上手门槛、空白画布引导体验与商业转化链路。

---

## 🚀 核心开源项目

### 1. [PatchCat (AI 提示流编排器与 DAG 状态机)](https://github.com/GuoBug/PatchCat)
纯前端、本地优先运行的确定性 AI 工作流编排系统。

- **在线体验**：[https://guobug.github.io/PatchCat/](https://guobug.github.io/PatchCat/)
- **核心工程特性**：
  - **DAG 拓扑调度**：基于 Kahn 算法实现端侧有向无环图调度与成环死锁规避；
  - **两级结构化输出防线**：L1 采样前 Logits 掩码受限解码 + L2 Zod 业务语义契约，主事件循环零抛错；
  - **运行时沙箱与看门狗**：Web Worker 5 秒超时硬熔断与基于调用指纹 (`hash(tool:args)`) 的死循环熔断器；
  - **分层解耦与 60FPS 渲染**：`useProjectStore` 与 `useWorkflowStore` 状态机切片，彻底消除 React Flow 脏重绘；
  - **StorageAdapter 双模存储**：零安装本地浏览器 LocalStorage 与异步 FastAPI 后端无缝切换。

#### 核心开源演进专栏（14 篇架构长文）：
- 📖 [开源系列 14：搞 Eval 评测前，先让输出闭合！结构化约束与业务契约防线](https://guobug.github.io/posts/2026/09/25/ai-prompt-orchestrator-structured-output-eval-prerequisite/)
- 📖 [开源系列 13：别让 Agent 刷爆你的信用卡！运行时看门狗与死循环熔断器设计](https://guobug.github.io/posts/2026/09/22/ai-prompt-orchestrator-agent-runtime-guard-watchdog/)
- 📖 [开源系列 12：把 AI 引擎塞进华硕路由器！Merlin 插件与轻量边缘网关实战](https://guobug.github.io/posts/2026/09/22/ai-prompt-orchestrator-asuswrt-merlin-edge-gateway/)
- 📖 [开源系列 11：鞋里有沙走不远，怎么让画布连线真正顺手？AABB 空间碰撞规避与微交互](https://guobug.github.io/posts/2026/09/19/ai-prompt-orchestrator-canvas-ergonomics-spatial-collision/)
- 📖 [开源系列 01–10：双引擎架构、Kahn 运行时、条件分支剪枝、ReAct Agent 工具调用与空白引导](https://guobug.github.io/posts/)

---

### 2. 实验工坊与硬件探索 (Labs & Hardware)
- **[玄学工具集 (Metaphysics Tools)](https://guobug.github.io/metaphysics-tools/index.html#)**：八字、六爻、紫微斗数与周易数理算法建模及交互计算。
- **[Kindle 墨水屏看板 (Kindle Weather Station)](https://github.com/GuoBug/kindle-weather-station)**：基于老旧 Kindle 墨水屏、7段数码管与轻量路由网关的极简桌面时钟。

---

## 🤖 机器可读协议与 GEO (生成式引擎优化)

本知识库全面适配主流大模型搜索引擎（Perplexity、ChatGPT Search、Claude、DeepSeek）：
- [`/llms.txt`](https://guobug.github.io/llms.txt)：高熵精简路由层，包含作者实体与核心项目定义；
- [`/llms-full.txt`](https://guobug.github.io/llms-full.txt)：深度工程推导层，提供工业级三段式（Problem - Solution - Outcome）架构实证；
- [`/sitemap.xml`](https://guobug.github.io/sitemap.xml)：全站一级显式索引。

---

> **关于作者**  
> **郭强 (GuoBug)**，Product Engineer，做平台工程也做业务增长。目前主要在折腾 AI 工作流编排、DAG 状态机与确定性系统架构。  
> 开源项目与主页：[https://github.com/GuoBug](https://github.com/GuoBug) · [https://guobug.github.io](https://guobug.github.io)  
> 欢迎就工作流引擎架构、拓扑调度和低门槛开发体验交流指教。
