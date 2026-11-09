---
layout: post
title: "崩了别慌：守护进程预写日志、崩溃打捞与 Git 差异补丁双闸门"
title_en: "Crash Without Panic: Write-Ahead Daemon Journal, Crash Forensics Salvage, and Two-Gate Git Patching"
date: 2026-10-31 23:00:00 +0800
categories: [AI, Architecture, Engineering]
pub_tag: "Crash Recovery & Self-Contained Review"
math: true
read_time: "14 MIN READ"
summary: "在多智能体系统从玩具走向生产级后台常驻的跃迁中，偶发性 SIGKILL、断电或宿主崩溃是无法逃避的物理现实。很多开发者依赖简单的死信队列，结果导致孤儿进程在后台继续暗中写入、新旧实例并发冲突、以及工作区陈旧代码误判等致命缺陷。本文深入拆解 FerryCat 守护进程的自愈架构：从派生前的三阶段预写日志（WAL）与原子压缩，到遵循 CK-05 的孤儿进程无盲杀存活探测与变更型任务保护；再到跨分支评审场景下，如何通过统一差异头、指针全覆盖与实质 Hunk 三重闸门，构筑兼具高容错与零篡改留痕的确定性自愈防御体系。"
summary_en: "As multi-agent systems transition from toy demos to production background daemons, sudden SIGKILL signals, abrupt crashes, and host failures become inevitable physical realities. Naive dead-letter re-queues frequently leave orphaned workers mutating code in the background, causing severe concurrency collisions and false-positive staleness errors. This article deconstructs FerryCat's daemon self-healing architecture: analyzing three-stage write-ahead journaling (WAL) before child spawning, CK-05-compliant liveness probing without blind signal hazards, and mutation task abort protections. Additionally, we unpack how our three-gate git diff verification eliminates prose bypasses, achieving robust cross-branch review capabilities with untampered audit integrity."
tags: [AI Workflow Orchestration, DAG Engine, State Machine, Write-Ahead Log, Crash Recovery, Git Patch, FerryCat, Multi-Agent Collaboration, Product Engineering]
series: "FerryCat · Multi-Agent Contract Orchestration"
---

> 项目开源地址：[GitHub - FerryCat](https://github.com/GuoBug/FerryCat) · 对应源码实现：[src/daemon.ts: 预写式日志与自愈调度](https://github.com/GuoBug/FerryCat/blob/main/src/daemon.ts)、[src/fingerprint.ts: Git 差异补丁三重闸门](https://github.com/GuoBug/FerryCat/blob/main/src/fingerprint.ts) 与 [测试套件 Test 19 ~ Test 20: 跨分支自包含补丁与崩溃自愈验证](https://github.com/GuoBug/FerryCat/blob/main/test/run-all.ts#L3055-L3520)  
> 前篇专栏回顾：📖 [绝不空手而归：基于惰性心跳与残片打捞的多 Agent 长任务治理]({{ '/posts/2026/10/26/never-return-empty-handed-lazy-heartbeat-and-salvage/' | relative_url }})

在线下排障时，很多资深系统工程师都有过这样的心惊时刻：

服务突然被宿主机的 OOM Killer 强杀，运维人员匆忙重启服务，以为一切已恢复正常。几天后才震惊地发现，被杀进程派生出的一堆子任务并没有彻底死透，它们依然以孤儿形态游荡在后台，继续向共享存储写入陈旧数据；而新接管的服务实例毫不知情地重新认领了同一批工单，两波进程在同一个工作区里同时落盘，造成了极其诡异的文件覆盖与状态撕裂。

在本地多 Agent 协同编程的场景下，这类崩溃事故往往更加隐秘且致命。

当调度中枢（Daemon）作为一个常驻后台进程运行时，它随时可能面临用户强关终端、宿主机休眠、垃圾回收卡顿（GC Pause）甚至是偶发性的系统断电。

如果系统在崩溃后仅仅机械地将未完成的工单退回队列，新启动的调度者在毫秒之内就会立刻将工单再次发给新的 Worker。此时，旧实例留在底层的编译器、测试跑批或大模型推演进程可能仍在往工作区写入。两个 Agent 同时修改同一份源码，不仅会瞬间击穿基于 SHA-256 指纹构建的防篡改基线，更会将整个代码库推入无法挽回的脏状态。

今天这篇，我们聊聊 FerryCat 是如何通过预写式任务日志、无盲杀存活探测与 Git 补丁三重闸门，为复杂的跨宿主协同架构装上全套自愈防线。

![崩了别慌 封面油画]({{ '/assets/images/cover-daemon-journal-crash-recovery.jpg' | relative_url }})

## 一、 预写日志：为什么派生子进程前必须先落盘？

在构建具备崩溃恢复能力的系统时，一个不可逾越的工程准则在于：状态转移的意图记录，必须物理严格先行于真实副作用的触发。这就是数据库领域历经数十年实战检验的 **WAL（Write-Ahead Logging，预写式日志）** 哲学。

在 FerryCat 的守护进程（`FerryCatDaemon`）中，每一个被认领任务的完整生命周期，都会被切片为三段不可逆的结构化事件并写入独立的日志底册：

1. `TASK_DISPATCHING`：调度器成功抢占任务并完成环境配置，在即将调用操作系统 API 派生子进程前的最后一微秒，同步将任务凭据（包含工单 ID、持单人令牌 `claim_token` 与执行文件）落盘至 `daemon-journal.jsonl`；
2. `CHILD_SPAWNED`：底层进程句柄成功建立，捕获到操作系统赋予的真实子进程标识（`child_pid`）与启动纳秒时间戳（`child_started_at`），第二段日志追加落盘；
3. `TASK_SETTLED`：子进程退出并提交产物，状态机落库完成终态收敛（`COMPLETED` / `FAILED`），记录最终结算标记。

```
[任务认领] 
   │
   ▼
[预写日志 1: TASK_DISPATCHING]  (意图先行落盘)
   │
   ▼
[系统派生子进程: spawn()]
   │
   ▼
[预写日志 2: CHILD_SPAWNED]      (记录 child_pid / started_at)
   │
   ▼
[大模型推理 / 脚本执行...]      💥 (若在此处断电崩溃)
   │                                  │
   ▼                                  ▼
[预写日志 3: TASK_SETTLED]        [新 Leader 接管重演]
```

如果系统在执行重型推理的过程中遭遇断电或硬件重启，第三段日志将永远无法写入。

当新的守护进程实例在宿主机重启后重新竞争并夺得 CAS 分布式租约时，首要动作是直接执行 `recoverFromJournal()` 扫描底册，严禁在未结算前认领新任务：

只要发现某个任务留下了派发意图，却从未留下 `TASK_SETTLED` 结算印记，系统就能以零歧义的确定性，精准锁定前任留下的坠毁现场。

## 二、 拒绝盲杀：CK-05 规约下的孤儿进程隔离与三叉自愈

锁定了崩溃工单，接下来该怎么收场？

在上一轮工程攻防审查中，团队的审查伙伴 WorkBuddy 针对最初的自愈逻辑提出了一个极其犀利的架构质疑：

> “如果在恢复时仅仅把工单状态 release 回队列，新 Leader 同周期立刻重新认领并跑一遍；而在真实的非断电崩溃（如守护进程自身 OOM）中，原本的子进程其实还在后台跑着并修改文件，这等于主动放任两个进程在同一工作区并发打架！”

更危险的是，有人可能会下意识地想：“既然日志里记下了子进程的 PID，恢复时直接给这个 PID 发送一个 `SIGKILL` 把它掐死不就行了吗？”

这是典型的初级并发陷阱。现代操作系统的 PID 是高度复用且生命周期短暂的数字。当前任崩溃数小时后新服务启动时，旧 PID 极大概率已经被操作系统重新分配给了一个完全无关的系统核心守护进程。盲目发送强杀信号，无异于在生产环境盲打霰弹枪。

FerryCat 严格执行 **CK-05 防 PID 复用误杀规约**：

我们通过非破坏性的探测手段 `isProcessAlive(pid)`（在 Node.js 中使用只探测权限与存活性、绝不向目标发送任何真实终止信号的 `process.kill(pid, 0)`），结合严格的业务三叉决策矩阵，彻底杜绝了并发破坏：

![FerryCat 守护进程预写日志与自愈矩阵架构图]({{ '/assets/images/flowchart-ferrycat-daemon-journal-crash-recovery.svg' | relative_url }})

### 1. 分支 A：孤儿仍在活动，坚决隔离熔断
如果探测显示原本的子进程依然存活（`childAlive === true`），说明虽然父级守护进程崩溃了，但底层代码依然在操作系统中真实执行。

此时系统严禁重新排队。新调度器直接调用 `failContract` 触发终态熔断，将工单置为 `FAILED`，并标记 `QUARANTINED_ORPHAN_ALIVE`。

在强杀与安全之间，架构坚决选择停止扩散风险，杜绝任何双进程并发污染工作区的物理可能。

### 2. 分支 B：变更型任务崩溃，严禁自动重试
如果工单属于 `implementation`（实现）或 `test_generation`（测试生成）这类旨在修改磁盘文件的变更任务，即便探测到子进程已经死亡，系统同样严禁自动重排重跑。

因为没有人能保证上一次崩溃前，大模型是否已经在磁盘上写了一半的半成品代码。盲目二次重写会直接破坏工作区的一致性基线。因此系统将现场证据打捞进 `salvaged_result_json` 后，显式置为 `MARKED_FAILED_MUTATION_UNSAFE`，交由开发者人工决策。

### 3. 分支 C：只读审查任务，安全退单重排
唯有当工单属于只读类型（`code_review` / `architecture_audit`），且确认前任子进程已经彻底消亡（`!childAlive`）时，系统才会调用 `releaseContract` 将其平稳放回队尾（`RELEASED_TO_QUEUE`）。

同时严格受控于单工单最多退回 3 次的断路器（`MAX_RELEASES`），彻底杜绝死循环僵尸任务。

## 三、 突破边界：Git 自包含补丁与三重安全闸门

解决了崩溃与并发写，另一个困扰多 Agent 协同的核心工程痛点浮出水面：跨分支代码审查的死锁。

在标准规范下，为了防范 Agent 基于过时文件凭空捏造审查结论，FerryCat 设立了极其严厉的指纹核验红线：只要工作区磁盘文件的 SHA-256 与派单基线不符，工单就会立即被终态判定为 `POINTER_STALE`（指针陈旧）。

但在真实研发协同中，发起审查的 Agent 往往处在特定的特性分支（Feature Branch）上，而负责跑审查的 Worker 节点本地工作区可能停留在 `main` 分支，甚至处于一个临时检出状态。

难道仅仅因为分支不同，自动化审查就只能被动报废吗？

为了在坚守防篡改红线的前提下兼顾工程灵活性，我们在 FC-202 中引入了 **自包含 Git 差异补丁模式（Self-Contained Git Patch Mode）**。发起方在派单时，可以通过 `--patch-file` 附带一段统一差异补丁文本（`git_patch`）。当 Worker 发现本地磁盘文件对不上时，系统允许安全回退至自包含审查模式。

然而，在第一次方案自测与攻防实测中，我们抓出了一个极其危险的安全漏洞：

最初的逻辑仅仅检查了“请求中是否附带了补丁字符串”。结果 WorkBuddy 编写探针随手传了一段 49 字节的普通散文文本（不含任何 diff 标记），工单居然成功避开了 `POINTER_STALE` 拦截，顺利被认领并标记为了已完成！

“只要有补丁存在”竟然成了绕过安全检查的非法通行证。

为了彻底消除这一隐患，我们建立了严密的三重前置物理闸门：

```
[git_patch 差异补丁载荷]
          │
          ▼
   【第一道闸门：统一格式校验】
   (必须包含 diff --git / --- / +++ 标准头，否则抛出 NOT_A_UNIFIED_DIFF)
          │
          ▼
   【第二道闸门：指针全量覆盖校验】
   (补丁声明触及的路径集合，必须 100% 覆盖工单声明的所有 pointers)
          │
          ▼
   【第三道闸门：实质 Hunk 与内容变更校验】
   (每个声明文件块必须拥有 @@ 边界，且至少包含 1 行 +/- 实质变更)
          │
          ▼
   【通过：进入 SELF_CONTAINED 模式】
```

1. `第一道闸门（格式检验）`：通过状态化差异词法解析器，强制验证文本必须包含标准的 `diff --git` 或 `---` / `+++` 标头，直接将伪装成补丁的垃圾散文文本拒之门外；
2. `第二道闸门（覆盖范围校验）`：强制比对差异标头所触及的文件路径集合与工单声明的 `pointers` 目标清单。如果一份补丁只修改了 `README.md`，却妄图去解锁针对 `calc.ts` 的审查契约，系统会立即拦截并报错 `PATCH_DOES_NOT_COVER_POINTERS`；
3. `第三道闸门（实质内容校验）`：针对仅有两行文件头却没有任何实质改动的空壳补丁（例如单行 `--- a/calc.ts`），解析器会精确校验每个文件块是否拥有完整的 `@@ ... @@` 语法块以及至少一行实际的 `+` 或 `-` 变更行（`EMPTY_PATCH_HUNKS`），杜绝形式主义空包。

更重要的是，针对自包含模式下的交单存证，系统坚决杜绝掩耳盗铃：

在交单留痕的 `verified_sha256` 字段中，系统严禁将发起方声明但并未在磁盘上核验通过的哈希值混入其中。未核验的指针会被彻底剔除，取而代之的是显式落库的真实存证：

```json
{
  "__patch_mode__": "SELF_CONTAINED",
  "__git_patch_sha256__": "8d344bcb79...",
  "__verified_on_disk__": "NO",
  "__unverified_pointers__": "calc.ts,feature-x.ts"
}
```

同时向 Worker 返回醒目的 `workspace_warning` 提示，清晰告知：“磁盘文件并非审查目标版本，请务必以补丁内容为基准开展推演”。

这种对审计留痕的极致诚实，捍卫了系统面对任何第三方安全追溯时的可信度。

## 四、 哲思与升华：从粗暴强杀到确定性自愈与法医打捞

回看很多初期的多 Agent 项目，人们往往沉迷于让大模型在终端里快速“跑通一个 Demo”，却习惯性忽视了真实软件工程环境下的残酷颠簸。

在面对崩溃、超时或环境不一致时，很多系统的本能反应往往是两种极端：要么盲目乐观地假设“下次重试就好了”，结果引发并发踩踏；要么粗暴强硬地下发一刀切的终止令，将之前推演的所有成果彻底粉碎。

![确定性自愈与打捞 哲思插图]({{ '/assets/images/illustration-deterministic-self-healing-salvage.jpg' | relative_url }})

真正的确定性系统，从来不是假定系统永远不会出错，而是在灾难降临的那一刻，系统能以何种姿态接住残局。

- **预写日志** 是对因果序的敬畏：走过的每一步，在操作系统感知前先在冷存储中压下印记；
- **法医打捞** 是对计算价值的尊重：哪怕任务中途折戟，已消耗的每一度电、推演的每一个 Token，也要提取出断点证据化作自愈的阶梯；
- **多重安全闸门** 是对防篡改底线的坚守：即便在跨分支、脱离单机文件系统的极端容错场景下，也不给虚假凭证留下一丝混水摸鱼的缝隙。

人与 AI 协作研发的迷人之处，恰恰在于这种双向启发式的架构共创：

业务痛点往往来自人在真实协同中的抓狂体验（分支总是不一致、一关终端任务就卡死）；而底层工程架构则需要 AI 搭档以冰冷而严密的视角，一层层排查出并发竞态、PID 复用陷阱与词法边界漏洞。在一次次激烈的白盒推演与红蓝攻防测试中，脆弱的玩具原型逐渐蜕变为能够抗击生产风浪的确定性基座。

## 五、 代价与适用边界

作为一名秉持务实态度的 Product Engineer，必须时刻警惕方案的技术代价与适用边界：

1. `预写日志带来的磁盘 I/O 开销`：每次子进程派生与结算都伴随着同步的文件写入与状态扫描。虽然我们在高频周期中引入了单 `lock_id` 物理隔离与原子文件压缩（Compaction），但在每秒数千次微型任务的超高吞吐场景下，频繁的磁盘追加依然会成为瓶颈。FerryCat 更专注于中重度协作任务（耗时数秒至数分钟的真实交接）；
2. `存活探测的时间窗口不确定性`：依赖 `process.kill(pid, 0)` 只能证明在探测瞬间目标进程是否存在于内核进程表中。如果一个孤儿进程恰好在被探测后的下一微秒退出，该工单依然会被严格判定为隔离熔断。这种设计倾向于宁可误杀保守隔离，绝不冒并发脏写风险；
3. `差异补丁的上下文局限性`：自包含差异补丁模式解决了代码审查与架构审计等只读理解类任务的跨分支痛点，但它天然无法直接应用于修改型任务（`implementation`）。如果一个任务需要在本地物理执行编译与全量单元测试，双方依然必须保持在同一分支与文件基线上。

## 六、 结语

在构建常驻后台的 AI 调度系统时，优雅地面对崩溃是一门必修课。

从最初的进程强杀黑洞，到惰性心跳打捞，再到今天由预写日志、无盲杀存活矩阵与补丁三重闸架构成的自愈防线，FerryCat 正在一步一步把不可控的黑盒协同，收敛进充满确定性的状态机铁轨之中。

系统随时可能崩溃，但只要底册在、基线在、边界在，系统就能在重新通电的瞬间自信站起，继续推进下一轮代码的交接与审查。

---

> 专栏与开源项目  
> **FerryCat（跨宿主 AI 智能体契约编排中枢）**：[https://github.com/GuoBug/FerryCat](https://github.com/GuoBug/FerryCat)  
> 欢迎 Star 关注或提交 Issue 交流。本专栏全部演进过程与实录工单均已在仓库内完全开源。  
> 下篇专栏更新：👉 [拒绝把日志当交付物：FerryCat v0.5.0 的防猜契约、智能注入与零配置沙箱]({{ '/posts/2026/11/09/never-guess-logs-as-deliverables-anti-guessing-delivery-envelope-and-safe-init/' | relative_url }})
>
> **关于作者**  
> **郭强 (GuoBug)**，Product Engineer，做平台工程也做业务增长。目前主要在折腾 AI 工作流编排、DAG 状态机与确定性系统架构。  
> 开源项目与主页：[https://github.com/GuoBug](https://github.com/GuoBug) · [https://guobug.github.io](https://guobug.github.io)  
> 欢迎就工作流引擎架构、拓扑调度和低门槛开发体验交流指教。
