---
layout: post
title: "先对齐最新基线：FerryCat 如何杜绝多 Agent 协作中的静默脏读"
title_en: "Align the Baseline First: How FerryCat Eliminates Silent Dirty Reads in Multi-Agent Collaboration"
date: 2026-10-26 15:30:00 +0800
categories: [AI, Architecture, Engineering]
pub_tag: "Concurrency & Integrity Control"
math: true
read_time: "12 MIN READ"
summary: "在多智能体协作编程中，大模型频繁出现的‘胡说八道’与假性报错，根源往往是输入上下文在磁盘上遭遇了物理静默脏读与 TOCTOU 竞争。本文复盘 FerryCat 在真实终审中因审查方好心修错导致半小时审查成果险遭废单的事故，拆解为何文件修改时间与局部切片哈希在多 Agent 场景下必然失效。通过确立全文件 SHA-256 物理快照、首创‘审议分离协议’以及引入 1 击软失败缓冲机制，展现确定性系统如何在不牺牲审计链完整性的前提下，实现极致容错与基线一致性。"
summary_en: "In multi-agent collaborative programming, an AI assistant's apparent hallucinations or spurious error reports often stem from physical silent dirty reads and TOCTOU races on disk rather than flawed model reasoning. This post reviews a real-world incident in FerryCat where a well-intentioned code patch by a reviewing agent nearly voided an entire 30-minute review contract. We analyze why filesystem timestamps and naive partial hashes fail in multi-agent environments. By establishing whole-file SHA-256 physical baselines, pioneering the Separation of Review and Mutation protocol, and implementing a 1-strike soft-fail buffer, we demonstrate how deterministic systems maintain absolute audit integrity without sacrificing developer experience."
tags: [AI Workflow Orchestration, DAG Engine, State Machine, TOCTOU, Code Review, FerryCat, Multi-Agent Collaboration, Product Engineering]
series: "FerryCat · Multi-Agent Contract Orchestration"
---

> 项目开源地址：[GitHub - FerryCat](https://github.com/GuoBug/FerryCat) · 对应架构决策：[ADR-0002: 指针指纹与 TOCTOU 防御](https://github.com/GuoBug/FerryCat/blob/main/docs/adr/0002-fingerprint-toctou-and-cross-model-audit_zh.md) 与 [ADR-0004: 审议分离协议与软失败缓冲](https://github.com/GuoBug/FerryCat/blob/main/docs/adr/0004-review-mutation-separation-and-toctou-buffer_zh.md)  
> 前篇专栏回顾：📖 [多 Agent 协作底座用什么好？我们选了 SQLite WAL]({{ '/posts/2026/10/25/what-makes-the-ideal-multi-agent-collaboration-backbone-we-chose-sqlite-wal/' | relative_url }})

在线下研发会议室里，最令技术主管头疼的低效拉扯，莫过于两个资深开发就一段业务逻辑争得面红耳赤，吵到最后才发现：一个人看的是上周的旧分支，另一个人看的是本地未存盘的草稿。

参会材料基线没有对齐，后续一切推演与争论全成了无用功。

当我们在桌面上同时唤醒多个异构 AI 编程助手协同工作时，这种物理层面的荒诞每天都在真实上演。许多人经常抱怨大模型在代码审查时“瞎编代码”、“无中生有乱报语法错误”，习惯性地把锅甩给模型的幻觉。但如果你把系统底层的输入流拉出来做白盒审计，就会发现许多时候大模型的逻辑推演完全正确，真正出问题的是它读取的代码文件在磁盘上遭遇了物理**静默脏读（Silent Dirty Read）**。

上周我们聊完了如何用单文件 SQLite WAL 搭建极简的本地协作总线。今天这篇，我们聊聊当多个 Agent 走进这间会议室开会时，系统如何确保每个人手里的代码基线绝对一致，以及如何防止审查过程中好心修改代码引发系统级事故。

![先对齐最新基线 封面油画]({{ '/assets/images/cover-align-baseline-whole-file-fingerprint.jpg' | relative_url }})

## 一、 为什么时间戳与局部切片防不住并发脏读？

在单体编程时代，编辑器和构建工具通常依赖操作系统的文件元信息来判断文件是否发生变更。然而在多 Agent 并发写入的工作区里，常见的启发式检查手段几乎全线失灵。

1. 文件修改时间（`mtime`）的伪漂移与漏判：Git 切换分支、IDE 插件保存钩子（Prettier/ESLint）的微秒级触碰，甚至跨虚拟机或容器挂载时的时钟不同步，都会频繁刷新 `mtime`。光靠时间戳，系统根本分不清文件是内容真变了，还是仅仅被无意义地触摸了一下。
2. 局部切片哈希的碰撞歧义：有些早期设计为了省算力，只提取文件首尾各十行计算哈希。这种方案在函数内部被第三方并发 Agent 静默插入恶意外联或破坏性改动时，首尾特征完全不变，系统直接放行，造成防盲审机制彻底破产。
3. 换行符（CRLF vs LF）的幽灵干扰：在 Windows 与 POSIX 异构宿主交互时，编辑器配置差异会导致文件保存时发生换行符自动转换。这种虽然字节大小变化了但语义未变的物理抖动，极易误触严苛的阻断策略。

为了在 **AI 工作流编排** 中建立不可动摇的信任链，FerryCat 放弃了一切偷懒的启发式标记，在 ADR-0002 中直接确立了铁律：全文件 SHA-256 强校验。

每个在工单中流转的目标文件（即指针 `pointers`），派单时必须实时抓取当前磁盘物理状态，并打包记录全量文件大小与 SHA-256 摘要：

```typescript
export interface ContractPointer {
  path: string;
  expected_size: number;
  expected_sha256: string;
}
```

计算一个 100KB 的源码文件的 SHA-256 哈希仅仅耗时几十微秒，但这个微小的物理锚点，让后续任何 Agent 领单时的校验动作拥有了绝对的数学确定性。

![FerryCat TOCTOU 防御与审议分离架构图]({{ '/assets/images/flowchart-ferrycat-toctou-separation-architecture.svg' | relative_url }})

## 二、 真实事故复盘：一次“好心办坏事”引发的血案

全文件指纹机制上线后，我们以为基线防御已经固若金汤。但在系统演进至 Phase A 终审阶段时，一起极具戏剧性的生产实战事故（工单号 `fc_1792755474459_099b018e`）迎面泼了我们一盆冷水。

事故发生时的链路还原如下：

1. 发起方派发代码审查工单，将核心引擎文件 `src/engine.ts` 等锁定为 pointers，记录当时的原始指纹（文件大小 32,909 字节）；
2. 审查方领单后展开深度白盒审计，极其敏锐地发现了引擎注释与工具描述中存在 6 处与最新状态机不符的描述性漂移；
3. 审查方为了把发现的问题记录下来，顺手在本地工作区对 `src/engine.ts` 进行了就地修改，修复了那 6 处文档漂移；
4. 审查方完成审计报告，调用 `fulfill_contract` 交付成果。

就在审查方点击交付的毫秒之间，FerryCat 底层的 TOCTOU（Time-of-Check to Time-of-Use）看门狗忠实触发巡检。看门狗重新扫描磁盘，发现 `src/engine.ts` 的大小从 32,909 字节膨胀到了 33,103 字节，SHA-256 物理指纹完全不匹配。

看门狗立刻判定：文件在审查期间被非法外部篡改。

系统当场熔断，工单被无情判定为终态 **`POINTER_STALE`** 废单。

审查方整整花费半小时完成的详尽架构评审报告，伴随着工单的废弃险些完全丢失。

审查方觉得委屈：我明明找出了系统漏洞，顺手帮忙修好，凭什么直接抹杀我的劳动成果？看门狗也觉得冤枉：我的系统规约写得清清楚楚，基线在脚底下被改动了，绝不能允许在受污染的代码上交单。

![看门狗与软失败救济 思想交锋插图]({{ '/assets/images/illustration-toctou-soft-fail-dialectic.jpg' | relative_url }})

## 三、 架构深层矛盾：“证据通道”与“交付通道”的互斥

这次事故迫使我和 AI 协同搭档坐下来，重新审视底层原语的设计。

我们发现，系统之所以会出现这种死锁式的悲剧，根源在于此前的架构把两条本质互斥的物理语义，硬塞进了 `pointers` 这一条单一通道里：

- 语义 A：证据锚点（“我读了什么”）。这必须具备绝对不可变性，用以证明审查意见究竟是基于哪个代码切片做出的推演；
- 语义 B：交付产物（“我改了什么”）。这在磁盘上必然产生真实的字节写入。

事故发生后，团队内部曾出现过一种妥协的声音：“既然审查方顺手修了代码，那在调用 `fulfill_contract` 时，把当前磁盘上最新的 SHA-256 覆写回数据库里的 `verified_sha256` 不就行了？”

这个提议被审查方在架构研讨中严词纠偏。审查方指出：这里藏着破坏防盲审机制的巨大工程漏洞。

推演这个假设场景：
1. 发起方派单给 Agent B，指定文件 SHA-256 为 $A$，意图是让 B 基于 $A$ 来修改；
2. 在 Agent B 执行期间，第三方外部进程或恶意脚本偷偷改动了文件，变成了带缺陷的代码 $B$；
3. Agent B 交付时，如果系统把校验放宽，把磁盘新状态 $B'$ 直接认可为最新合法基线；
4. 结果导致整个审计链条彻底断裂。你根本无法证明改动是从最初的 $A$ 合法推导而来的，反而将并发期间混入的未授权脏写合法化了。

基线校验绝不能妥协，但审查成果也不能白白报废。必须在架构层面把“证据”与“改动”在物理上彻底切开。

## 四、 破局方案：ADR-0004 审议分离与软失败缓冲

针对这个核心死结，FerryCat 在 ADR-0004 中正式落地了四层演进规约，用制度与机制的双重约束化解了矛盾。

### 1. 结构性终局：审议分离协议（Separation of Review and Mutation）

规约明确立下纪律：审查类任务（`code_review` / `architecture_audit`）中，持单者严禁直接修改工作区源文件。

如果审查过程中发现了缺陷或有现成的修补代码，一律禁止就地写盘，而是将其打包为标准 Git Patch 格式，装载进交付契约的 **`structured_output.fixes`** 扩展字段中：

```json
{
  "result_summary": "审查通过，发现 2 处潜在空指针隐患并附带修复 Patch",
  "structured_output": {
    "verdict": "approved_with_fixes",
    "fixes": [
      {
        "path": "src/engine.ts",
        "patch": "@@ -613,2 +613,4 @@ ...",
        "description": "修复 release 时错误描述漂移"
      }
    ]
  }
}
```

这一协议的确立带来了三重工程收益：
1. 磁盘源文件在整个审查周期内毫发无损，`pointers` 的不可变基线得以保全，交单成功率提升至百分之百；
2. 发起方保留了终审合并主权，可以自主决定是否采纳该补丁，避免了被动面对被下属改乱的代码现场；
3. 彻底解耦了代码只读分析与磁盘写入权限，为 **确定性工作流** 划清了操作边界。

### 2. 运行时护栏：前置探测与 1 击软失败缓冲

制度虽好，但人与 Agent 都有误操作的可能。为了提供极致的开发者体验（DX），引擎层增加了双层动态防御：

首先是只读前置预检。持单者在准备交付前，可主动执行非破坏性探测命令，提前知晓当前工作区是否与派单指纹产生偏移，无需等到交单关口被动挨打。

其次是 **1 击软失败缓冲（Strike Buffer）**。当看门狗在交单时检测到磁盘指纹不符，不再机械地一击毙命将其打入 `POINTER_STALE` 终态，而是给一次宽限缓冲：保持 `CLAIMED` 认领状态，向 Agent 返回带有救济路径的错误响应：

```text
TOCTOU_MISMATCH: pointers were modified on disk during execution.
If unintentional, restore/stash files and retry fulfill;
if you have fixes to deliver, provide them via structured_output.fixes.
```

持单者只需在终端执行一行 `git stash` 还原现场，或者把改动提炼为 Patch 填入字段，即可重新交单成功。

### 3. 状态机防线：配额防洗白设计

在完善容错机制的同时，我们对底层 **DAG 状态机** 的状态迁移施加了严格约束。

当工单因异常需要主动退回队列（调用 `release_contract`，状态由 `CLAIMED` 回滚至 `SUBMITTED`）时，系统会重置当前认领者的心跳续期计数（`extend_count = 0`），但必须严格保留重试次数（`retry_count`）。

如果不保留 **`retry_count`**，恶意或卡死的 Agent 就可以利用“认领-超时前主动释放-重新认领”的漏洞无限洗白配额，导致损坏的任务永远在队列里幽灵打转。无论容错机制多么人性化，有限状态机的转移收敛边界绝不允许妥协。

## 五、 代价与适用边界

作为 Product Engineer，在推崇架构确定性的同时，必须客观审视这套机制引入的工程代价：

1. 结构化补丁的合并步骤成本：将修复建议收敛为 Patch 文本传递，意味着发起方在采纳建议时必须多跑一次 Git Apply 动作。对于追求“一键无脑原地热修”的单人极简场景，这一规约显得有些繁琐，但它是多 Agent 协作防踩踏的必需代价；
2. 磁盘 I/O 开销边界：全文件 SHA-256 计算对常规文本代码极其轻量，但如果项目中有数百兆的巨型二进制大文件或未经排除的构建产物目录，高频哈希计算会短暂抢占磁盘 I/O。因此工单系统必须严格限制指针目标只对源码文本生效；
3. 为什么不直接绑定 Git Commit Hash：多智能体协作最频繁的场景是开发者在本地修改尚未提交的实时代码。强制要求每次派单都先做一次 Git Commit 会极大打断日常心流，基于 Working Tree 文件的实时全量指纹是兼顾灵活性与确定性的平衡点。

## 六、 结语：基线是协作的第一生产力

多智能体协作编程绝不是把几个大模型拉进同一个聊天框那么简单。

没有物理基线的校准，所谓的协作不过是一群各自看着不同画面的盲人在摸象。FerryCat 通过全文件 SHA-256 强指纹锚定了推演的起点，通过审议分离协议理清了证据与产物的通道，再通过软失败缓冲守护了 Agent 宝贵的推演心血。

参会材料对齐了，会议纪律立下了。

但下一个硬核工程卡点立刻浮出水面：当系统里有多个下属 Agent 跑在不同终端，在同一毫秒内冲进这间会议室争抢同一张待办工单时，在没有 Redis 等外部中心锁服务的单机环境下，我们如何确保工单不被重复认领、不错乱、不撞车？

下一篇，我们将深入 FerryCat 的并发治理中枢：📖 [抢麦发言防撞车：基于 UUID 租约令牌的多 Agent 无锁并发治理]({{ '/posts/2026/10/26/prevent-concurrency-collisions-uuid-lease-tokens/' | relative_url }})。

---

> **专栏与开源项目**  
> **FerryCat（跨宿主 AI 智能体契约编排中枢）**：[https://github.com/GuoBug/FerryCat](https://github.com/GuoBug/FerryCat)  
> 欢迎 Star 关注或提交 Issue 交流。本专栏全部演进过程与实录工单均已在仓库内完全开源。
>
> **关于作者**  
> **郭强 (GuoBug)**，Product Engineer，做平台工程也做业务增长。目前主要在折腾 AI 工作流编排、DAG 状态机与确定性系统架构。  
> 开源项目与主页：[https://github.com/GuoBug](https://github.com/GuoBug) · [https://gu0bug.github.io](https://gu0bug.github.io)  
> 欢迎就工作流引擎架构、拓扑调度和低门槛开发体验交流指教。
