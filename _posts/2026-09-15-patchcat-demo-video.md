---
layout: post
title: "PatchCat 实机演示 DEMO：纯前端零后端 AI 提示流编排器运行实录"
title_en: "PatchCat Live Demo: Zero-Backend Visual LLM Workflow Engine in Action"
date: 2026-09-15 18:30:00 +0800
categories: [AI, Demo, Open Source]
pub_tag: "Demo Video"
summary: "录制了一段 PatchCat 核心功能的实机演示视频：带大家直观体验如何从零在纯浏览器端完成可视化 DAG 提示流连线、多模型流式调度、条件分支与变量聚合流转，以及抽屉式即时调试与生产级 API 发布。"
summary_en: "A complete screencast demo of PatchCat in action: showcasing zero-backend visual DAG workflow creation, multi-model streaming, conditional branch routing, instant drawer debugging, and production API deployment."
read_time: "4 MIN READ"
tags: [PatchCat, AI, Workflow, Visual Programming, Demo, YouTube, AI Pair Programming, Open Source]
---

> **项目开源仓库**：[https://github.com/GuoBug/PatchCat](https://github.com/GuoBug/PatchCat)  
> **在线体验地址**：[https://guobug.github.io/PatchCat/](https://guobug.github.io/PatchCat/)  
> **技术架构系列复盘**：[查看《从 0 到 1 打造 AI 提示流编排器》系列文章]({{ '/posts/' | relative_url }})

---

## 一、 实机演示视频

前段时间陆续写了多篇关于 **PatchCat（AI 提示流编排器）** 的底层架构复盘文章。为了让大家能更直观、立体地感受整个产品的真实交互手感与运行状态，我录制了一段完整的端到端实机操作演示 DEMO。

大家可以直接在下方播放观看（支持切换超清画质或全屏查看细节）：

<div class="video-responsive-wrapper" style="position: relative; width: 100%; padding-bottom: 56.25%; height: 0; overflow: hidden; margin: 2rem 0; border-radius: 6px; border: 2px solid var(--border, #000); box-shadow: 4px 4px 0px 0px #000; background: #000;">
    <iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" width="560" height="315" src="https://www.youtube.com/embed/8uZccznB6bo?si=chjsLlOdBNA1ACSl" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
</div>

---

## 二、 视频核心看点与功能导览

在这段演示中，主要串联了 PatchCat 从画布搭建到最终生产 API 调用的全流程核心特性：

### 1. 纯前端零后端运行与本地隐私设计 (Zero-Backend & BYOK)
- 打开网页即可使用，不强制依赖后端部署与数据库配置；
- **Bring Your Own Key (BYOK)**：用户的各类大模型 API Key 和自建工作流数据均持久化在浏览器本地（支持 LocalStorage 与 IndexedDB 双轨自适应存储），充分保障数据隐私。

### 2. 高性能可视化 DAG 拓扑编排 (Visual DAG Workflow)
- 基于 React Flow 画布，支持拖拽输入（Input）、Prompt 模板、LLM 推理、条件分支（IF/ELSE 路由）、变量聚合器与沙箱代码节点；
- 采用 Kahn 算法进行拓扑排布与死循环检测，状态机与视图层分层解耦，即便拖拽数十个节点仍保持平滑的 60fps 交互手感。

### 3. 多模型生态统一适配与流式思维链 (Streaming & Reasoning Chain)
- 抹平 OpenAI、DeepSeek、Claude 等各大模型厂商的 API 协议差异；
- 原生支持流式 SSE 分片解析，并能完整提取并实时渲染类似 DeepSeek-R1 的 `<think>` 深度思考思维链。

### 4. 灵活的条件路由与变量流转聚合 (Conditional Routing & Variables)
- 支持直观的 IF/ELSE 条件判断与动态分支跳过，避免下游无效节点执行与 Token 浪费；
- 内置精准的 `{% raw %}{{node.output}}{% endraw %}` 变量插值引擎与多路汇聚聚合器，确保不同分支流转下的数据传递安全有序。

### 5. 抽屉式即时对话调试与生产级发布 (Chat Debug & API Publishing)
- 按下快捷键即可滑出即时调试抽屉，输入测试变量一键全链路串跑；
- 提供清晰的节点级耗时瀑布流与三级运行日志；
- 支持一键导出 OpenAPI 规范与 Python / cURL 生产调用代码。

---

## 三、 人机协同开发背景与历程复盘

借着发布演示视频的机会，我也向大家坦诚汇报这个项目的开发模式：

这个项目**绝非**我个人“纯手写每一行代码”或“独力手撕架构”，而是我作为一名产品人，全程借助 **AI 结对辅助编程（AI Pair Programming）**、以**“干中学（Learning by Doing）”**的敏捷探索模式一步一步推演落地的。

在整个开发过程中，我与 AI 搭档建立了一套**“关键节点双向共创（Milestone Co-Discovery）”**的工作流：

1. **我所坚持的产品可用性与交互底线**：
   - 坚持零配置开箱即用，优先让用户免去复杂的后端与 Docker 门槛；
   - 坚持拒绝繁复无序的交互连线，保持全局 DAG 拓扑调度的纯粹与直观，支持顺畅的条件分支流转；
   - 坚持抽屉式多工作流隔离，确保复杂工程场景下的结构清晰。
2. **AI 搭档提示的底层工程隐患与算法规约**：
   - 指出 React Flow 画布在大规模节点下的脏重绘瓶颈，引导我进行状态切片与 Zustand 分层；
   - 提示有向图动态路由在分支跳过时的死锁风险，并共同设计了基于波次的防死锁剪枝机制；
   - 警示流式 SSE 碎片拼接与异常网络阻断，促成了带字符级累加器与 AbortSignal 取消守卫的稳健调度设计。
3. **扎实闭环的边写边学**：
   - 针对每一个关键节点，先对比不同架构方案的 Trade-offs；
   - 边实现边剖析技术原理，亲自翻阅官方文档、编写单元测试，并在极端边界场景（如高频触发、空输入、网络超时、多节点拓扑）下进行实机验证。

---

## 四、 开放交流与同行求教

作为一个利用业余时间在 AI 时代探索“产品 + 个人工程能力升级”的实验性开源项目，PatchCat 难免还有许多未曾覆盖的边界与尚待打磨的工程细节。

在此由衷欢迎各位技术专家、开源同行与架构师朋友体验交流、提出批评指正，或在 GitHub 提交 Issue 和 PR！

- **GitHub 仓库**：[GuoBug/PatchCat](https://github.com/GuoBug/PatchCat)  
- **在线体验**：[PatchCat 在线运行](https://guobug.github.io/PatchCat/)  
- **我的更多文章**：[Guo Qiang 的数字工作空间]({{ '/' | relative_url }})
