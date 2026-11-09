---
layout: post
title: "拒绝把日志当交付物：FerryCat v0.5.0 的防猜契约、智能注入与零配置沙箱"
title_en: "Never Guess Logs as Deliverables: Anti-Guessing Delivery Envelopes, Safe Config Injection, and Zero-Config Sandboxing in FerryCat v0.5.0"
date: 2026-11-09 23:00:00 +0800
categories: [AI, Architecture, Engineering]
pub_tag: "Anti-Guessing Delivery & Zero-Config DX"
math: true
read_time: "15 MIN READ"
summary: "很多多智能体系统在从原型走向实用时，总会撞上一道隐形高墙：为了试用它，用户必须手动在多个 IDE 间搬运繁琐的 MCP 配置；而在自动化执行时，系统又常把子进程随手打印的 console.log 粗暴猜成最终审查结论，甚至在静默退出时伪造成功摘要。本文拆解 FerryCat v0.5.0 的工程解法：从显式 delivery 信封与空输出熔断，到保护 JSONC 注释的 7 宿主智能注入向导，再到 3 秒零依赖沙箱演练，彻底切断多 Agent 协作中的猜测链条。"
summary_en: "When transitioning multi-agent systems from prototype to production, developers inevitably face a frustrating barrier: users must manually sync complex MCP JSON configs across multiple IDEs, while automation runtimes frequently misinterpret arbitrary console logs as structured deliverables or fabricate success summaries upon silent exits. This article breaks down FerryCat v0.5.0's engineering solutions: from explicit delivery envelopes and silent-exit tripwires, to comment-preserving JSONC injection across 7 host editors, and an ephemeral zero-config sandbox, systematically eliminating guesswork in agentic collaboration."
tags: [AI Workflow Orchestration, DAG Engine, State Machine, Delivery Envelope, MCP, JSONC, Developer Experience, FerryCat, Product Engineering]
series: "FerryCat · Multi-Agent Contract Orchestration"
---

> 项目开源地址：[GitHub - FerryCat](https://github.com/GuoBug/FerryCat) · 对应源码实现：[src/delivery.ts: 交付信封防猜解析器](https://github.com/GuoBug/FerryCat/blob/main/src/delivery.ts)、[src/init.ts: 多宿主安全配置注入向导](https://github.com/GuoBug/FerryCat/blob/main/src/init.ts)、[src/demo.ts: 零配置沙箱演练](https://github.com/GuoBug/FerryCat/blob/main/src/demo.ts) 与 [测试套件 Test 21 ~ Test 22: 交付信封与向导防漂移测试](https://github.com/GuoBug/FerryCat/blob/main/test/run-all.ts#L3827-L4240)  
> 前篇专栏回顾：👉 [崩了别慌：守护进程预写日志、崩溃打捞与 Git 差异补丁双闸门]({{ '/posts/2026/10/31/crash-without-panic-daemon-write-ahead-journal-and-git-patch-gates/' | relative_url }})

在多智能体系统与开发者工具的研发中，工程师常常会陷入一种自欺欺人的局部最优。

我们在终端里写下复杂的调度逻辑，看着两个模型在精心编排的固定路径下顺利握手，便以为系统已经成熟。但只要把这个工具发给同事，真实的阻力立刻就会显现出来：想要跑通一次端到端协同，用户得先在两个不同的编辑器里找到深藏在系统目录下的配置文件，小心翼翼地复制粘贴几段复杂的 JSON 代码。只要少加了一个逗号，或者覆盖了用户原本的配置，整个接入体验就会瞬间崩溃。

更危险的隐患藏在交付环节。为了省事，早期的原型系统通常会把被调起脚本的标准输出直接作为模型读取的上下文。如果脚本执行到一半随手打印了一句调试日志，或者打印了一段包含花括号的非结构化文本，调度器就会自作聪明地把这段日志猜测为最终的结构化审查结论，甚至连子进程静默退出都能被算作执行成功。

这种基于猜测的宽容，是确定性工作流工程化落地的大敌。

在刚刚发布的 FerryCat v0.5.0 中，我们把精力集中在了消除这种随意性上。通过确定性的 stdout 交付信封、带注释保护的多宿主智能配置向导，以及能在临时沙箱中 3 秒自闭环演练的原生命令，把松散的桌面协同真正收敛到可预测的轨道上。

![拒绝把日志当交付物 封面油画]({{ '/assets/images/cover-align-baseline-whole-file-fingerprint.jpg' | relative_url }})

## 一、 交付防猜协议：为什么任意标准输出都不能被猜成产物

在 FerryCat 的架构中，常驻守护进程或 CLI Worker 会以受控子进程的形式调用外部脚本。这些脚本既可能是挂载了静态分析规则的 AST 校验器，也可能是接入了外部测试套件的评测执行器。

在没有强制协议约束时，传统系统的解析器往往采取一种过度宽松的启发式策略：从标准输出里按行扫描，只要看见合法的 JSON 对象，就擅自提权为 `structured_output` 交付物。

这种设计在现实场景下极其脆弱。一个运行中的审查脚本可能依赖了第三方的代码检查工具，而这些工具在标准输出中也会交错输出形如 `{"level": "info", "rule": "no-var"}` 的结构化日志。一旦调度器将第一段或最后一段日志提取为结论，工单就会因为缺少必填的业务判据字段而陷入连续重试甚至校验熔断。

在 FerryCat v0.5.0 中，我们引入了显式的交付信封契约协议（`parseExecDelivery`）：

<p align="center">
  <img src="{{ '/assets/images/flowchart-ferrycat-cross-host-demand-and-workflow.svg' | relative_url }}" alt="FerryCat 跨宿主契约摆渡全景" width="960" />
</p>

### 1. 结构化信封的单行与多行闸门

执行脚本如果希望向总线提交正式结论，必须且只能通过顶层键名包裹输出：

```json
{"ferrycat_delivery": {"result_summary": "通过 12 项静态分析", "structured_output": {"passed": true}}}
```

解析器严格执行多重校验：
- **歧义阻断**：若输出中存在多个信封行，直接判为 `DELIVERY_AMBIGUOUS` 拒绝，防止多重交付引发结论不确定；
- **格式防退化**：为了防止开发者在多行美化输出时被无声降级，解析器引入了正则键匹配 `["']?ferrycat_delivery["']?\s*:`。如果日志里出现了信封键名却无法解析为单行对象，立刻报出 `DELIVERY_MALFORMED` 阻断，杜绝将整块美化文本误当成摘要交付；
- **白名单清洗**：信封内仅允许出现协议规定的元数据字段，任何拼错的键名都会在第一道关卡被当场拦截。

### 2. 空输出的静默欺骗与硬性拦截

在人机双向共创推演中，AI 审查伙伴在工单 `fc_1793689000576_9352d58c` 中敏锐指出了一个极隐蔽的逻辑盲区：当一个脚本发生死锁或者未打印任何字符就以退出码 0 退出时，宽松的解析器会把空文本视为无结构化输出的普通文本，并在最后为工单兜底补上一句 `Completed via automated worker exec: <label>`，导致工单被假阳性标记为已完成。

真实工程必须对静默欺骗采取零容忍态度。我们在 `delivery.ts` 中补齐了针对空输出与纯空白文本的拦截铁律：

```typescript
if (!text) {
  return reject(
    'DELIVERY_MISSING',
    'Child process exited with empty stdout; no deliverable payload or summary was produced.'
  );
}
```

没有产生有效交付信息的脚本，无论退出码多么完美，都将被判定为交付缺失并置为失败终态，同时将上下文现场完整保存在 `salvaged_result` 中供开发者回溯排障。

---

## 二、 智能注入与零破坏合并：`ferrycat init` 的无痛接入

想要让开发者在一个复杂的同机多宿主拓扑中用起工具，仅有严密的协议是不够的。

在真实场景中，开发者桌面往往同时运行着多个基于 Model Context Protocol 的客户端。不同的宿主对配置文件的命名规范和存储位置有着各自的历史包袱：有的习惯用下划线，有的在扩展名前加上句点；有的宿主支持在根目录就地识别，有的则必须存放在专门的应用支持路径下。

如果要求用户逐个去翻找这 7 款编辑器的技术文档并手动配置 JSON 节点，绝大多数人会在第二步直接放弃。

```
[ferrycat init]
   │
   ├── 嗅探本机宿主 (Antigravity / WorkBuddy / Cursor / VS Code / Claude Code...)
   │
   ├── 读取原配置文件 (保护 JSONC 行级与块级注释)
   │
   ├── 备份至 <config>.ferrycat-bak-<timestamp>-<rand>
   │
   └── 原子写盘原位合并 (冲突智能保护，绝不覆写无关服务)
```

### 1. JSONC 注释保护与原子备份

许多工程团队会在本地编辑器的配置文件里写满诸如 `// 公司代理配置，请勿修改` 的业务说明。如果直接使用标准的 `JSON.parse` 与 `JSON.stringify`，所有的换行、缩进风格与注释信息都会被彻底抹平。

`ferrycat init` 实现了保留原始格式与注释的文本级合并逻辑。在执行任何磁盘写入之前，系统会生成带有时间戳和随机短后缀的独立备份文件，并通过临时文件完成原子重命名落盘。即便发生突发断电或磁盘写满异常，临时文件也会在异常分支中被安全清理，绝不污染用户的开发目录。

### 2. 避免测试与实现共享同一个错误假设

在适配特定宿主时，我们曾遇到过一个典型的同源认知陷阱。

在首轮审查中，测试用例假定某宿主读取的是 `mcp.json`，而代码实现也按照这个前提进行了路径拼接。测试套件全绿通过，但在真实机器上，该宿主实际读取的却是带有点前缀的隐藏文件 `.mcp.json`。此时测试与实现共享了同一个错误前提，构成了隐蔽的盲区。

在第二轮复核中，我们将其重构为优先嗅探已存在配置的合并逻辑：

```typescript
function firstExistingConfig(dir: string, names: string[]): string {
  for (const name of names) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return full;
  }
  return path.join(dir, names[0]);
}
```

同时在自动化测试中独立预置带有点前缀的真实宿主结构，断言系统绝不会在已有配置文件旁边凭空建立第二个同名副本，确保向导能平滑适应不同环境。

---

## 三、 3 秒直达真相：`npx ferrycat demo` 的零配置沙箱

在产品工程领域，衡量一个底层基础工具易用性的核心指标，是新用户从初次听说到亲眼目睹其工作状态所需的认知摩擦。

过去，想要向他人演示跨宿主状态机流转，必须在本地启动两套大型客户端，并分别配置好 MCP 连接。这种高昂的演示成本，常常让优秀的架构思路被埋没在漫长的环境搭建过程中。

我们在 v0.5.0 中交付了原生的 `ferrycat demo` 命令。

开发者不需要克隆源码，不需要注册 API Key，甚至不需要安装任何特定编辑器，只需在终端中敲下一行指令：

```bash
npx ferrycat demo
```

终端在 2 秒内便会输出结构清晰的状态跃迁全景：

```text
⚡ FerryCat Zero-Config Sandbox Demo ⚡
Sandbox: C:\Users\...\Temp\ferrycat-demo-K3m8v1

  ✔ [1/4] Contract Dispatched
    Locked    src/calc.ts (sha256: 7f8a9b2c...d4e5)
  ✔ [2/4] Contract Claimed
    Lease     e4129b80-1a2c-49f3-8b7a-92c81726a105
  ✔ [3/4] Execution & Schema Check
    Heartbeat 1 lease renewal(s) | CHANGES_REQUESTED (loose equality caught)
  ✔ [4/4] Contract Completed
    TOCTOU    fingerprints matched (0 dirty files) | Status: COMPLETED (elapsed: 2.1s)

  🎉 End-to-end multi-agent handoff verified successfully!
```

### 拒绝虚假的假人表演

很多命令行工具的 demo 命令只是打印几行带颜色的延时定时器，用来营造出一种正在计算的视觉假象。这种做法在严谨的系统工程中没有任何说服力。

`ferrycat demo` 的底层完全复用了核心引擎与常驻守护进程的生产代码：
- 在系统临时目录下建立完全隔离的临时目录与独立的 SQLite 数据库，坚决不碰开发者的正式存储；
- 真实派生独立的 Node.js 子进程沙箱，向其标准输入灌入契约载荷；
- 子进程真实调用抽象语法树分析逻辑，检出测试源码中故意留存的非严格相等缺陷，并在执行期真实触发 1 次心跳续期；
- 按照交付信封契约真实完成二次指纹复核，最后流转至已完成状态并安全清理沙箱。

只有当演示代码走过与生产完全一致的状态机铁轨，终端输出的绿色对勾才能成为可信的技术凭证。

---

## 四、 零外部依赖的代码防腐门禁

在构建轻量级基础工具时，工程依赖的膨胀往往是系统走向笨重与不稳定的起点。

很多工具为了保证代码质量，习惯性引入几十个由不同维护者构建的格式检查包。然而只要 Node.js 升级主版本，复杂的 C++ 原生绑定和深层依赖树就会频繁引发构建中断，使跨平台测试变成苦力活。

FerryCat 选择了一条更加克制的工程路径。我们基于内置模块编写了专属的代码卫生与静态分析门禁（`scripts/lint.js`），在零外部依赖的前提下守护系统规范：

1. **协议传输流纯净性防线**：MCP 基于标准输入输出通道传输 JSON-RPC 消息帧。门禁会静态扫描服务端核心源码，严禁在初始化之后向标准输出直接写入裸文本，防止普通打印污染通信信道；
2. **异步非阻塞不变量守卫**：调度中枢要求高响应性，静态检查会彻底扫描生产模块，严禁出现诸如同步挂起等破坏事件循环活跃度的原始调用；
3. **元数据规约自动化对齐**：针对官方模型上下文协议注册表的模式限制，门禁会自动抓取配置文件中的元数据字段，一旦描述文本超过字符上限便直接报错，在本地提交流程中把所有格式隐患彻底掐灭。

![代码防腐与确定性铁轨 哲思插图]({{ '/assets/images/illustration-toctou-soft-fail-dialectic.jpg' | relative_url }})

---

## 五、 代价与适用边界

面对任何技术方案，我们都必须清醒地审视其必须付出的工程代价与应用边界：

1. 信封协议的改造成本：引入顶层包裹契约有效根除了模糊猜测，但这也意味着既有的旧版脚本必须调整标准输出格式才能提交结构化数据。为了平滑过渡，系统在自动模式下仍兼容纯文本摘要交付，但严格拒绝自动将其提权为具备校验效力的结构化结论；
2. 注释保留的容错上限：基于文本启发式规则的配置文件注入，能够完美处理符合标准的键值插入与标准注释，但如果用户本身的配置文件存在严重的语法截断或极度小众的排版格式，系统会选择跳过原位修改以防止损坏数据，此时仍需开发者通过参数指定明确路径；
3. 沙箱演练的临时磁盘开销：由于坚持真子进程、真数据库与真文件校验，每次执行演练都会产生瞬时的磁盘读写与进程派生损耗。虽然单个沙箱在 2 秒内就会自动销毁，但它不适合被塞入每秒高频调用的性能微基准测试中。

---

## 六、 结语

从最初为了解决跨软件未存盘代码静默盲审，到今天演进出一整套具备防猜契约、智能注入与零门槛演练的健壮系统，FerryCat 走过的每一步，都在向确定性靠拢。

写出能够让两个智能体互相对话的原型或许只需要一个下午，但要把这种交互变成任何开发者都能在 3 秒内上手、绝不损坏用户配置、绝不把多余日志误当结论的生产级工具，必须依赖一遍又一遍对边界场景的严密敲打。

系统不需要多余的猜测。把意图写在契约里，把状态留在底册上，智能体之间的协作才能真正跨越进程与窗口的阻隔，成为开发者手中踏实可靠的延伸。

---

> **关于作者**  
> **郭强 (GuoBug)**，Product Engineer，做平台工程也做业务增长。目前主要在折腾 AI 工作流编排、DAG 状态机与确定性系统架构。  
> 开源项目与主页：[https://github.com/GuoBug](https://github.com/GuoBug) · [https://guobug.github.io](https://guobug.github.io)  
> 欢迎就工作流引擎架构、拓扑调度和低门槛开发体验交流指教。
