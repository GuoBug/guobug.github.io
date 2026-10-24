---
layout: post
title: "如何像主管一样组织 Agent 协作：FerryCat 契约编排中枢的演进之路"
title_en: "Orchestrating AI Agents Like a Tech Lead: The Evolution of FerryCat's Contract-Driven Hub"
date: 2026-10-24 22:45:00 +0800
categories: [AI, Architecture, Engineering]
pub_tag: "Multi-Agent Governance & System Contracts"
math: true
read_time: "12 MIN READ"
summary: "把多个异构 AI 编程窗口当成下属员工开代码评审会，绝不是让它们漫无边际地自由聊天，而是由人类主管定议题、锁指纹、立规矩。本文作为 FerryCat 系列专栏总篇，复盘了我们如何从手忙脚乱的跨窗口搬运工，升维为主持全局的技术主管。通过真实的三方异构智能体闭环博弈实录，拆解 FerryCat 契约编排中枢在并发争抢、隐性丢单、进程逃逸等真实工程深水区的治理实践，展示确定性工作流如何让开发者从体力协调中彻底解脱，稳坐终审席行使最终裁决权。"
summary_en: "Treating heterogeneous AI coding assistants as team members in an architectural review board is never about letting them chat unconstrained. Instead, it demands that the human engineering lead locks file fingerprints, sets rigorous verification agendas, and establishes system-level contracts. As the keynote of the FerryCat series, this post examines our evolution from frantic multi-window clipboard couriers into authoritative technical chairs presiding over review boards. Backed by real-world multi-agent dialectic consensus traces, we dissect how a deterministic contract hub resolves concurrent preemption, at-most-once execution losses, and orphaned process tree leaks, empowering developers to govern autonomous agents with decisive human-in-the-loop sign-off."
tags: [AI Workflow Orchestration, DAG Engine, State Machine, FerryCat, Multi-Agent Collaboration, Product Engineering, System Contracts]
series: "FerryCat · Multi-Agent Contract Orchestration"
---

> 项目开源地址：[GitHub - FerryCat](https://github.com/GuoBug/FerryCat) · 三方智能体真实验收决议：[2026-10-24-phase-3-multi-agent-consensus-audit_zh.md](https://github.com/GuoBug/FerryCat/blob/main/docs/audits/2026-10-24-phase-3-multi-agent-consensus-audit_zh.md)  
> 前篇需求发刊词：📖 [为什么我开始做 FerryCat：当你的电脑上同时开着两个 AI 编程软件]({{ '/posts/2026/10/22/why-we-built-ferrycat-cross-host-agent-review-bus/' | relative_url }})

两周前，我在前篇博文中聊过做 FerryCat 的初衷：为了打破单个模型自己审查自己代码的同源思维盲区，我在桌面上同时双开不同厂商的 AI 编程宿主，结果立刻沦为全职的人肉剪贴板搬运工。

那时的 FerryCat 还只是一个刚跑通单机摆渡的 Demo 雏形。我们在派单、领单、交单之间设计了文件快照比对，要求人类像“扳道工”一样，在左边窗口派单、切到右边领单、再切回来读报告。虽然免去了复制代码的麻烦，也挡住了旧代码盲审的隐患，但一个尖锐的工程质问随之而来：

如果一场代码评审会，依然需要人类在每个参会人员的工位之间来回跑腿传话，这算哪门子的自动化？

真正的团队协作绝不是跑腿传话。在一家成熟的工程团队里，一个技术主管（Tech Lead）是怎样组织代码评审会的？他定好议程、圈定改动范围，把资深架构师、安全专家和测试工程师拉进同一个房间；下属们带着代码和测试用例当面挑刺、白盒辩论；主管坐在主位把控时间节奏，并在最终事实面前敲下法槌，签署是否同意合并的决定性裁决。

这就是 FerryCat 演进到 Phase 3 的核心定位：我们不再做人肉传话筒，而是像技术主管一样组织 Agent 开会。

![如何像主管一样组织 Agent 协作 概念油画]({{ '/assets/images/cover-orchestrate-agents-like-a-tech-lead.jpg' | relative_url }})

## 一、 角色升维：从手忙脚乱的搬运工，到稳坐主位的会议主席

很多刚接触多智能体（Multi-Agent）协作的开发者，很容易滑向两个极端：要么把所有希望寄托在“全自动自由聊天戏台”上，任由一群 Agent 互相吹捧、反复死锁；要么因为不可控，退化为全程紧盯每个字符的手工操作者。

作为一个兼具底层架构与增长业务经验的 Product Engineer，我更倾向于把模型还原为具备特定长板也有明显盲区的数字化员工：
1. 主力实现 Agent（如 Antigravity / Claude）：代码产出快，擅长搭建系统骨架与写算法，但往往自我感觉良好，极易忽视边缘条件与竞态；
2. 安全与架构 Critic（如 ChatGPT / DeepSeek）：理论功底深厚，擅长在宏观层面挑刺，但偶有理论教条，容易将概率性锁冲突夸大为系统瘫痪；
3. 测试与对端验收者（如 WorkBuddy）：极度务实、锱铢必较，一切以回归红线与独立复现证据说话，绝不采信任何口头报告。

在这群性格迥异的员工面前，人类主管的价值从来不是帮他们贴代码，而是构建一个不可逾越的**确定性工作流**与制度底座。

![FerryCat 契约编排中枢与智能体评审会架构图谱]({{ '/assets/images/flowchart-ferrycat-agent-review-council-architecture.svg' | relative_url }})

主管在这个中枢里只执掌三项核心权力：
* 定议程（Lock Scope）：开会前对改动目录拍下全文件 SHA-256 物理指纹，未经存盘或中途被篡改的文件坚决不准上会；
* 立规矩（Enforce Protocol）：给评审会装上看门狗，杜绝下属发言开小差、长任务丢结果或散会后留孤儿暗中乱改代码；
* 终审裁决（Decisive Sign-off）：不看两千字无意义小作文，只看基于 9 项严密检查点的客观结构化报告，行使最终的 Commit & Push 否决权。

## 二、 拒绝炼金术：三个异构智能体员工的白盒对抗实录

在 FerryCat Phase 3（常驻守护与主动唤醒引擎）的推进中，我们没有停留在纸面推演，而是全程通过 FerryCat 自己的工单总线，组织了一场由三个异构角色 Agent 参与的白盒评审会：
* 主力实现 Agent（承担代码提议与工程落地）；
* 安全与架构 Critic（负责并发边界与系统隐患挑刺）；
* 对端验收 Agent（专职离线验证与严格回归把关）。

真实世界里工程师推演架构绝无万灵药，这场评审会记录了三方智能体在关键工程节点上的真实过招：

```
[Round 1] 实现 Agent -> 架构 Critic (fc_1792845563_59f32f3b)
  ├─ 议题：定性本地执行风险与进程边界
  └─ 架构 Critic 裁决：CHANGES_REQUESTED（指出并发重复拉起、命令注入与进程树逃逸等 5 大风险）

[Round 2] 实现 Agent -> 对端验收 Agent (fc_1792845046_d4a59f0f)
  ├─ 议题：源码级排雷与 At-most-once 丢单定位
  └─ 对端验收 Agent 裁决：CHANGES_REQUESTED（揭露 300s 缺失心跳导致丢产物 P0，证伪单单并发拉起假象）

[Round 3] 实现 Agent -> 架构 Critic (fc_1792845845_8633fd47)
  ├─ 议题：数据库锁模型与守护并发机制
  └─ 架构 Critic 裁决：CHANGES_REQUESTED（指出 SQLite 无行锁，否定 BEGIN IMMEDIATE 长期长事务）

[Round 4] 实现 Agent -> 对端验收 Agent (fc_1792846232_b951b411)
  ├─ 议题：Step 0 开工准入检查项定稿与签署
  └─ 对端验收 Agent 裁决：APPROVED（签发 CK-01 至 CK-09 九大准入红线）
```

这场长达数小时的多模型闭环博弈，撕开了多智能体协作中两个极其经典的伪经验陷阱：

### 1. 否定长事务：SQLite 锁真相与短事务 CAS 租约
在讨论守护进程互斥时，架构 Critic 曾提出“使用 `BEGIN IMMEDIATE` 独占长事务保证单实例”。这个提议被迅速纠偏：SQLite 没有行级锁，取得写保留锁的长事务会直接卡死外部所有 `dispatch`、`poll` 和 `extend`，并阻塞 WAL 自动 Checkpoint 导致 `-wal` 膨胀几百兆。

最终三方合流为短事务原子 CAS 模型：
$$\text{ON CONFLICT}(id) \text{ DO UPDATE SET ... WHERE } expires\_at < now$$
每一次抢占、续期都控制在单条 SQL 的微秒级原子写事务内，把整库可用性完整归还给用户。

### 2. 反向 DX 陷阱：环境变量剥离过头的代价
为了防范子进程恶意读取宿主敏感环境变量，最初设想将子进程环境粗暴剥离至仅剩 `PATH`。但对端验收 Agent 敏锐地指出：下游主流 CLI 严重依赖用户主目录下的认证配置文件。

盲目剥离会导致它们读不到 `~/.config` 或 `%APPDATA%`，造成开箱即暴毙的“全员未登录”惨剧。最终架构采用了严格的平台化最小环境子集，剥离 `*_TOKEN`、`*_KEY` 的同时，完整保留登录锚点变量。

![多智能体评审席与求真辩论 概念油画]({{ '/assets/images/illustration-multi-agent-review-board-dialectic.jpg' | relative_url }})

## 三、 主管的法槌：六大硬核实战关卡全景

把 Agent 当下属开会，光靠口头立规矩毫无意义，系统的每一处卡点都需要白盒级工程防线作为支撑。围绕这一套技术中枢，我们提炼出了支撑其稳健运转的六大核心支柱（也是本专栏后续将深度拆解的实战专题）：

| 序号 | 架构命题 | 主管视角的治理痛点 | 底层确定性工程解法 |
| :---: | :--- | :--- | :--- |
| 01 | 存储与并发选型 | 不起后台重型网络服务，拒绝端口冲突与运维负担 | SQLite WAL 单文件无锁总线与短事务 CAS 租约机制 |
| 02 | 信任契约防脏读 | 防范 Agent 拿着未存盘旧代码一本正经胡说八道 | 全文件 SHA-256 指纹锚定与 ADR-0004 的 1 击软失败缓冲 |
| 03 | 多实例并发租约 | 同一个 Agent 起了多实例，并发抢单撞车越权 | UUID 独占租约令牌（`claim_token`）与 CAS 状态切片 |
| 04 | 任务失联心跳守护 | 模型复杂推演跑了 5 分钟，结果超时被系统判死、产物蒸发 | 动态自动心跳保活（`min(60s, ttl/3)`）与超时日志残片打捞 |
| 05 | 进程树跨平台清理 | 评审散会了，后台孙进程还在悄悄改源码污染下次评审 | POSIX 独立进程组与 Windows `taskkill /T /F` 递归灭活 |
| 06 | 环境沙箱与气密性 | 既防代码偷窃宿主 Token，又保证测试绝不污染生产总线 | 最小环境沙箱白名单与气密性隔离测试（Hermetic Test） |

## 四、 “能做到最好就不糊弄”：一次真实的打回实录

在 FerryCat 的开发中，我和 AI 搭档始终恪守一条研发铁律：在技术探索和学习阶段，能做到最好就绝不糊弄妥协。

昨夜在验收 Phase 3 Step 0 时，我们亲历了一次极具警示意义的审查过程：
当我完成了守护进程与心跳模块的代码，本地 13 个自动化测试套件全部跑通，终端亮起绿色的 `ALL 13 TEST SUITES PASSED GREEN`。我将代码打包装入工单 `fc_1792849711838` 派发给对端验收 Agent 审核，原以为能顺利通过，结果验收方毫不留情地签署了 `REVISE_REQUIRED`，直接拒签！

它在审计报告中写下了一段振聋发聩的话：
> “本机全绿恰恰是最危险的地方：它把跨平台未验证伪装成了通过！13A 硬编码了 Windows 路径，在 Linux/macOS 上缺少环境变量；13D 没有写实际断言是伪通过；更致命的是，13B 的引擎构造函数漏传了包裹对象，把测试数据直接写进了生产总线库！CI 是六格跨平台矩阵，推上去四个 Job 必定全红！”

这段批评一针见血。我们没有辩解，而是立刻坐下来拆解真因：
1. 跨平台解耦：在测试中显式构造 `'win32'` 与 `'linux'` 双重环境矩阵进行比对断言；
2. 端到端硬断言：给超时打捞补齐 `EXEC_WINDOW_EXHAUSTED` 与 `salvaged === true` 的数据库日志回查；
3. 修复测试气密性：修复漏传对象的构造调用，增加隔离校验断言，并彻底清理生产库中的所有脏行。

当我们把气密性证明再次送审时，对端验收 Agent 进行了严密的独立复跑，最终签署了带绝对防线背书的 `APPROVED`。

这种被自己的数字化下属“当面打脸、倒逼深挖原理、直至做到最优解”的经历，正是多智能体协作带给工程师最纯粹的技术爽感。

## 五、 结语：让技术主管的尊严回归工程

AI 浪潮发展到今天，工具的演进不该让人类变得愈发被动和焦虑。

构建 FerryCat 的过程让我坚信：**AI 工作流编排** 的终局不是制造更多不受控的黑盒幻象，而是通过清晰的原语设计、收敛的状态机与坚固的系统契约，把混乱的模型推理约束在秩序井然的工程铁轨上。

当你不再被琐碎的跨窗口传话绑架，当你的异构 Agent 员工能够在总线上基于指纹和契约自主辩论，你便能真正以一个合格技术主管的姿态，平静地坐在评审席的主位上，审视呈递上来的每一份白盒证据，从容地决定这个系统的未来走向。

下一篇，我们将正式进入实战篇的第一站：拆解为什么在这个充斥着云端中转的时代，我们偏偏要用单文件 SQLite WAL 搭建一座零配置的单机协同底座。

---

> **专栏与开源项目**  
> **FerryCat（跨宿主 AI 智能体契约编排中枢）**：[https://github.com/GuoBug/FerryCat](https://github.com/GuoBug/FerryCat)  
> 欢迎 Star 关注或提交 Issue 交流。本专栏全部演进过程与实录工单均已在仓库内完全开源。
>
> **关于作者**  
> **郭强 (GuoBug)**，Product Engineer，做平台工程也做业务增长。目前主要在折腾 AI 工作流编排、DAG 状态机与确定性系统架构。  
> 开源主页：[https://github.com/GuoBug](https://github.com/GuoBug) · 博客：[https://guobug.github.io](https://guobug.github.io)  
> 欢迎就工作流引擎架构、拓扑调度和低门槛开发体验交流指教。
