---
layout: post
title: "当 PatchCat、FerryCat 与 EdgeCat 合体：我对“主权 AI 运行时”的未来愿景与工程边界"
title_en: "Converging PatchCat, FerryCat, and EdgeCat: A Vision for a Local-First Sovereign AI Runtime"
date: 2026-11-15 22:30:00 +0800
categories: [AI, Architecture, Product]
pub_tag: "Sovereign AI Runtime & Multi-Agent Architecture"
math: false
read_time: "10 MIN READ"
summary: "过去几个月，我通过 AI 辅助编程与干中学的方式先后构建了三个看似独立的开源项目：浏览器端 DAG 编排器 PatchCat、跨宿主契约总线 FerryCat，以及纯静态 Go 推理治理网关 EdgeCat。当把这三块拼图放在一起审视时，它们共同指向一个更完整的产品形态：面向个人与小团队的本地优先主权 AI 运行时（Sovereign AI Runtime）。本文系统梳理这一三合一愿景的分层架构、真实工作流场景、商业化切入点权衡，以及必须坦诚面对的异构运行时整合代价与能力边界。"
summary_en: "Over the past few months, through AI pair programming and learning by doing, I built three seemingly separate open-source projects: PatchCat (a browser-native DAG workflow orchestrator), FerryCat (a contract-driven cross-host MCP handoff bus), and EdgeCat (a pure-static Go inference governance and PII gateway). Viewed together, they form the architectural foundation of a Local-First Sovereign AI Runtime for individuals and small teams. This essay outlines the unified three-layer vision, concrete unattended engineering workflows, product entry-point trade-offs, and the real integration costs across heterogeneous runtimes."
tags: [AI Workflow Orchestration, DAG Engine, State Machine, Local-First, Multi-Agent Systems, Model Context Protocol, EdgeCat, FerryCat, PatchCat, Product Engineering]
series: "Sovereign AI Infrastructure · 三猫架构演进"
---

> 关联开源仓库：[PatchCat](https://github.com/GuoBug/PatchCat) · [FerryCat](https://github.com/GuoBug/FerryCat) · [EdgeCat](https://github.com/GuoBug/EdgeCat)  
> 前篇专栏回顾：👉 [流式 SSE 遇上 Token 截断：EdgeCat 如何用帧级滑动窗口实现零泄漏的 PII 脱敏还原]({{ '/posts/2026/11/15/edgecat-sliding-window-sse-pii-rehydration-and-lossless-passthrough/' | relative_url }})

{% raw %}
**主权 AI 运行时（Sovereign AI Runtime）**是指将算力路由与隐私脱敏、**确定性工作流**编排以及多 Agent 契约验收统一收拢在用户本地设备与内网边界之内，使个人与小团队在不交出数据主权的前提下，安全、低成本且可恢复地调度异构大模型与工具完成复杂长任务的基础设施。

过去几个月，我借助 AI 辅助编程和“干中学”的方式，陆续写了三个名字都带“Cat”的开源项目：浏览器端侧的 PatchCat、本地多宿主协作总线 FerryCat，以及静态 Go 推理网关 EdgeCat。起初它们各自解决的是我在日常工程中踩到的具体痛点——画布编排、多 IDE 互审撞车、外网请求防泄密与控预算。

但最近和几位朋友复盘时，一个更清晰的问题浮出了水面：如果把这三个项目继续打磨并整合成一个统一产品，它到底应该长成什么样？
{% endraw %}

![三猫架构合体：主权 AI 运行时 抽象封面油画]({{ '/assets/images/cover-cat-trilogy-sovereign-ai-runtime.jpg' | relative_url }})

{% raw %}
---

## 一、 为什么我们需要“个人数字工厂”，而不是又一个聊天窗口？

今天大多数人使用 AI 的方式依然原始。面对一个稍微复杂点的工程或研究任务，我们往往要在浏览器、Claude Code、Cursor 和本地终端之间来回切换，自己充当“人肉复制粘贴路由器”。一旦某个模型出现幻觉、改坏了现有文件，或者在长任务执行到第 8 步时突然断网，前面消耗的时间和 Token 就会全部作废。

市面上的通用 AI 产品已经非常多，但它们大多围绕“单窗口问答”或“云端 SaaS 自动化”展开，在个人和小团队的高敏工作场景下存在三个结构性缺口：

| 维度 | 云端通用助手 / 传统编排 SaaS | 三合一主权 AI 运行时（愿景形态） |
| :--- | :--- | :--- |
| 数据与隐私主权 | 提示词、源码与凭证经由第三方云端流转 | 核心资产与记忆留在本地，出网前由网关内存级脱敏还原 |
| 失败恢复与成本 | 任务中断往往从头重来，无限重试易刷爆账单 | **DAG 状态机**支持断点逆向回溯，本地算力优先且日额度硬熔断 |
| 多 Agent 协作 | 缺乏物理基线校验，容易盲审脏文件或互相覆盖 | 强制 SHA-256 指纹对齐、UUID 租约锁与 Schema 契约验收 |
| 核心定位 | 对话式副驾驶或跨 SaaS 连接器 | 面向真实文件与本地环境的可信工程控制面 |

我不想再造一个什么都能聊的通用助手，也无意在几百个 SaaS 连接器数量上和 n8n 正面竞争。我认为真正有长期价值的，是为个人和小型极客团队造一座**自带隐私金库、流水线调度台和监理团队的数字工厂底座**。

---

## 二、 三合一架构：从“各自救火”到三层协同

如果把 PatchCat、FerryCat 和 EdgeCat 拼在一起，它们恰好对应了这套运行时的三个核心层次，各自守住一条工程底线：

### 1. 算力与隐私底座：EdgeCat（守住安全与账单）
设备端算力（Mac Studio、家用 NAS、甚至路由器）与云端大模型本不该是对立的。在理想形态下，EdgeCat 作为静默运行的本地网关，接管所有下游工具和工作流的模型流量。

常规、高频的简单推理直接留在局域网内的 Ollama 或 vLLM 上免费消化；当本地并发满载或遇到复杂推理需要调用公网强模型时，网关在内存中自动完成手机号、密钥与内网 IP 的脱敏替换，并在流式响应返回时无损还原，同时用每日云端配额给预算加上硬上限。

### 2. 确定性编排大脑：PatchCat（守住可控与复用）
一次偶然跑通的复杂任务只是“抽卡成功”，只有沉淀下来才算生产力。PatchCat 承担的正是**AI 工作流编排**与知识记忆的角色。

它把原本发散的多轮对话，固化为带拓扑顺序的确定性图谱：用静态预检拦截环路和幽灵变量引用，用纯端侧 BM25 与向量混合检索挂载本地知识库，用双锚点裁剪防止上下文失焦，并在某个节点失败时只做局部逆向回溯重跑，不再全盘推倒重来。

### 3. 多 Agent 契约总线：FerryCat（守住交付质量）
当工作流里出现“写代码、补单测、做安全审计”这类需要不同专业 Agent 分工的重任务时，PatchCat 不必把所有活都塞给同一个模型，而是通过 FerryCat 向下游多个宿主（如本地的 Coding Agent 或专项研究进程）派发任务契约。

Agent 之间不靠礼貌的自然语言寒暄交接，而是靠 UUID 租约防抢麦、全文件 SHA-256 指纹防脏读、以及严格的 JSON Schema 交付信封校验结果。验不过就按重试上限打回重写，直到交付物满足物理和格式契约。

{% endraw %}

![从混沌走向秩序：三层架构融合 抽象油画插图]({{ '/assets/images/illusion-three-pillars-convergence.jpg' | relative_url }})

{% raw %}
---

## 三、 愿景落地后的两个真实工作画面

这套架构如果真正跑顺了，日常工作会变成什么样子？

#### 画面一：夜间无人值守的工程流水线
下班前，你在工作台提交一个“模块重构 + 边界单测补全 + 变更文档更新”的目标。夜间，PatchCat 将任务拆解为可执行图谱并按波次调度；所有推理请求经过 EdgeCat 自动过滤掉本地环境密钥，优先使用本地模型生成初稿；FerryCat 协调两个不同的编码与审查宿主交替写补丁、跑测试并基于真实文件哈希互相挑刺。第二天早上你打开界面，看到的不是几千行杂乱日志，而是一份通过契约校验的 Git Diff 和停在最终合并节点的审批确认框。

#### 画面二：桌面为核、移动为哨的轻量化延伸
这套系统的重算力和文件状态必须稳稳扎在你的主力桌面机或家庭服务器上，因为真实的代码库、SQLite 状态和本地模型都在那里。未来如果需要跨端协同，手机或平板并不需要在小屏幕上画复杂的节点图——它只需要做好“下达目标”和“接收关键高危操作审批推送”这两件事就够了。

---

## 四、 商业化切入点与必须直面的工程代价

在和朋友的讨论中，有一个问题非常尖锐：三个项目如果合体，究竟应该以谁作为商业或用户入口，另两个退居幕后？

如果一上来就宣称自己在做“宏大的个人 AI 操作系统”，大概率会死在概念过重和接入门槛太高上。以我目前作为 Product Engineer 的判断，两条相对务实的切入路线是：

1. **以 EdgeCat 为入口**切“合规与成本治理”：3MB 静态二进制、改一个 Base URL 就能接入现有工具，不强迫用户立刻改变工作习惯，先把“防泄密 + 本地算力省钱”的刚需跑通，再把 PatchCat 的可视化审计与工作流编排挂在网关后面。
2. **以 FerryCat + PatchCat 为入口**切“多 AI 编程工程监理”：专治同时开多个 AI 编程工具时文件互相覆盖、盲目改错的问题，把确定性交付变成开发者每天离不开的工作台。

更重要的是，任何架构愿景如果不写明代价，就只是自我感动的口号。把这三个项目真正融合，面前至少横着三座必须翻越的工程大山：

* 异构运行时的整合复杂度：目前 PatchCat 是浏览器前端（TypeScript + IndexedDB），FerryCat 是本地 Node.js MCP 进程，EdgeCat 是纯静态 Go 二进制。直接硬拼会导致进程托管、跨进程状态同步和安装包分发极其脆弱。未来必须选定一个核心守护进程（例如以 Go 网关为宿主底座）来统一生命周期。
* 确定性透明与低门槛体验的张力：工程上我追求契约、租约和指纹校验的绝对严谨，但普通用户并不想理解什么是拓扑排序或 TOCTOU 竞争。如何把复杂的状态机封装在“默认自动托管、仅在异常或高风险处显式露头”的交互之下，决定了它能不能走出极客圈。
* 技术过度建设的诱惑：架构师很容易沉迷于把状态机和协议打磨到理论满分，却忽略了用户真正付费买单的，永远是某个具体场景下稳定交付的结果。

---

## 五、 写在最后

把这三个项目合在一起看，它们其实是我过去十几年从底层系统、商业增长一路走到 AI 原生工程的思维投影：我不太相信完全不受约束的“黑盒魔法”，更相信**用确定性的工程护栏，去放大概率性模型的真实生产力**。

这套三合一的“主权 AI 运行时”目前还远未到终局，它只是从三块独立打磨的积木里长出的一张蓝图。下一步，我会先尝试在单机桌面环境里把三者的数据契约与流量链路真正串起来，边做边验证真实工作负载下的体验与边界。

如果你也在折腾 **AI 工作流编排**、本地优先架构或多 Agent 工程治理，非常欢迎来仓库提 Issue 或交流拍砖，一起把这套个人数字工厂的拼图补得更扎实。
{% endraw %}

![主权边界与开放视界 抽象油画插图]({{ '/assets/images/illusion-sovereign-boundary-horizon.jpg' | relative_url }})

---

> **关于作者**  
> **郭强 (GuoBug)**，Product Engineer，做平台工程也做业务增长。目前主要在折腾 AI 工作流编排、DAG 状态机与确定性系统架构。  
> 开源项目与主页：[https://github.com/GuoBug](https://github.com/GuoBug) · [https://guobug.github.io](https://guobug.github.io)  
> 欢迎就工作流引擎架构、拓扑调度和低门槛开发体验交流指教。
