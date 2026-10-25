---
layout: post
title: "多 Agent 协作底座用什么好？我们选了 SQLite WAL"
title_en: "What Makes the Ideal Multi-Agent Collaboration Backbone? We Chose SQLite WAL"
date: 2026-10-25 20:00:00 +0800
categories: [AI, Architecture, Engineering]
pub_tag: "Storage Engine & Concurrency Control"
math: true
read_time: "11 MIN READ"
summary: "在桌面端同时调度多个异构 AI 编程助手时，首要难题是给它们搭建一个可靠的数据总线。很多人第一反应是上 Redis 或云端消息队列，但这在本地开发场景下带来了极高的配置负担与端口冲突。本文拆解 FerryCat 为什么放弃重型中间件与本地裸文件锁，选用单文件 SQLite WAL 作为跨宿主协作底座。通过剖析 C++ 原生扩展的 ABI 跨版本泥潭、SQLite 无行锁下的长事务全库死锁隐患，以及微秒级短事务原子 CAS 租约设计，展现确定性工作流如何在零网络依赖下实现高吞吐无锁并发。"
summary_en: "Presiding over multiple heterogeneous AI coding assistants on a single desktop requires a dependable, zero-friction shared bus. While developers often reach for Redis or cloud-hosted message brokers, doing so introduces unnecessary operational complexity and port conflicts into local environments. This post details why FerryCat abandoned heavy middleware and naive local file locks in favor of single-file SQLite WAL. By dissecting C++ native add-on ABI incompatibilities across host Node runtimes, the catastrophic full-database lockouts caused by long transactions in a table-locking engine, and our microsecond atomic CAS lease design, we demonstrate how deterministic workflows achieve robust local-first concurrency without external dependencies."
tags: [AI Workflow Orchestration, DAG Engine, State Machine, SQLite WAL, FerryCat, Multi-Agent Collaboration, Product Engineering]
series: "FerryCat · Multi-Agent Contract Orchestration"
---

> 项目开源地址：[GitHub - FerryCat](https://github.com/GuoBug/FerryCat) · 对应架构决策：[ADR-0001: 跨宿主 SQLite WAL 总线](https://github.com/GuoBug/FerryCat/blob/main/docs/adr/0001-cross-host-sqlite-wal-and-poll-model_zh.md) 与 [ADR-0005: 受控守护进程与短事务 CAS](https://github.com/GuoBug/FerryCat/blob/main/docs/adr/0005-controlled-daemon-and-process-supervision_zh.md)  
> 前篇专栏总论：📖 [如何像主管一样组织 Agent 协作：FerryCat 契约编排中枢的演进之路]({{ '/posts/2026/10/24/orchestrating-ai-agents-like-a-tech-lead/' | relative_url }})

在上一篇专栏中，我把多智能体协作比喻为一场由人类技术主管主持的代码评审会。下属各抒己见，主管居中定夺。

但要把这场会议真正组织起来，首要的物理卡点在于数据总线的选型。当你的电脑上同时跑着 Google Antigravity、Cursor、WorkBuddy 或者其他基于 MCP（Model Context Protocol）的独立宿主时，它们各自运行在操作系统完全隔离的子进程里，内存互不相通。

数据要在这些互不信任、异构运行时的 Agent 之间流转，底座应该选什么？

许多团队在做多 Agent 编排时，习惯性地把后端微服务架构直接搬到本地：起一个 Redis 实例做发布订阅，或者搭一个 RabbitMQ，甚至在公网架设中心化 HTTP 中转服务器。我们在早期预研时也对比过各种方案，但在真实桌面工程场景下，这种重型思维几乎瞬间就会被击碎。

最终，我们把整个协作中枢的数据总线，收敛在了一张仅有几个字段的单文件 **SQLite WAL** 数据库上。

![多 Agent 协作底座用什么好 封面油画]({{ '/assets/images/cover-multi-agent-backbone-sqlite-wal.jpg' | relative_url }})

## 一、 桌面场景的物理约束：为什么重型中间件行不通？

在服务端架构中，引入一个 Redis 或 Kafka 只是一行 Docker Compose 配置的事情。但作为面向终端开发者的桌面工具，宿主环境有着现实制约：

1. 端口冲突：要求普通开发者为了让两个编程助手互审代码，先在本地配一套 Docker 或常驻监听 6379 端口的后台守护服务，安装门槛直接劝退 90% 的用户；
2. 网络策略：工程师在飞机上、高铁上或企业严格的离线局域网内写代码是家常便饭，依赖外部网络调用的中转方案立刻瘫痪；
3. `stdio` 进程模型的短连接特征：IDE 宿主拉起 MCP Server 时，走的是标准输入输出管道，宿主随时可能休眠或重启子进程，外部网络连接的心跳维护极其脆弱。

那么退回纯本地文件系统，用最质朴的本地 JSON 文件配合 `fs.writeFile` 或操作系统文件锁（`flock`），可行吗？

我们在验证原型时很快遭遇了现实的阻拦：在 Windows 系统下，操作系统强制锁（Mandatory File Locking）会导致并发读写频繁触发 `EBUSY` 与 `EPERM` 异常崩溃；而在没有事务机制保护的文件系统上，两个 Agent 同时覆写同一份状态文件，必定引发 JSON 截断损坏。

我们需要一个既不需要起外部网络服务、又能提供严格 ACID 事务与有限状态机支持的本地存储。

![多 Agent 协作底座架构范式对比图]({{ '/assets/images/flowchart-sqlite-wal-vs-traditional-broker.svg' | relative_url }})

## 二、 原生扩展的暗坑：从 better-sqlite3 到 node:sqlite

选定 SQLite 似乎是理所当然的决定。但在决定如何集成 SQLite 时，我和 AI 协同搭档踩进了一个陷阱。

在 Node.js 生态中，提到 SQLite，绝大多数人的第一反应是性能优异的 `better-sqlite3`。我们在初始原型中也毫不犹豫地引入了它，单元测试在主力开发机上跑得飞快。

然而，当我们将插件分别挂载进两个宿主进行联合联调时，问题出现：
一个宿主启动毫无问题，另一个宿主却直接喷出错误：

```text
Error: The module '\\?\F:\...\better_sqlite3.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION 127. This version of Node.js requires
NODE_MODULE_VERSION 115. Please try re-compiling...
```

原因是：同一台开发机上，系统全局 PATH 里安装的是 Node v24.19.0，而另一个宿主内部内嵌的托管运行时却是 Node v22.12.0。

`better-sqlite3` 依赖 C++ 原生扩展（Native Addon）。一旦宿主调用的 Node.js 二进制版本与编译插件时的 ABI 不匹配，整个进程就会在 `require` 阶段当场暴毙。要求用户在本地安装 Visual Studio C++ 构建工具链去重新编译动态链接库，违背了开箱即用的产品底线。

在方案权衡的关键节点，AI 搭档提出了一个重要的标准库演进事实：自 Node.js v22.5 起，官方已经将 SQLite 引擎直接内置进了核心模块 `node:sqlite`。

虽然它目前需要显式携带 `--experimental-sqlite` 参数启动，但它的优势是决定性的：
* 零 C++ 外部依赖：动态链接库直接由 Node.js 运行时内嵌二进制提供，彻底杜绝 ABI 跨版本冲突；
* 极速分发：生产环境 `node_modules` 无需携带任何 `.node` 预编译平台包，体积从几十兆压缩到纯脚本文件；
* 天然跨平台：无论用户是 Windows、macOS 还是 Linux，只要运行时高于 v22.5，行为完全确定。

我们果断重构了整个存储层，基于内置模块完成了基础存取封装。

## 三、 读写并行的基石：WAL 机制与共享内存索引

解决了运行时依赖，接下来要面对的是并发性能：多个 Agent 可能会同时查询工单状态，而人类调度器或守护进程又在同时写入。

SQLite 在默认的 Rollback Journal 模式下，并发策略非常粗暴：只要有任何连接开启写事务，整张数据库的所有读请求全部被阻塞。这会导致正在执行长推演的 Agent 在读取上下文时频繁遭遇 `SQLITE_BUSY` 报错。

解开死锁的钥匙是打开 WAL（Write-Ahead Logging）日志模式：

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

在 WAL 模式下，SQLite 实现了关键的读写并发不变式：读操作从不阻塞写操作，写操作也从不阻塞读操作。

它的内部机理非常优雅：
1. 写日志追加：当写入事务提交时，数据并不直接覆写主库 `mesh.db`，而是以追加写的方式记入 `mesh.db-wal` 临时日志文件；
2. 共享内存索引：操作系统通过 `mesh.db-shm` 共享内存文件建立 WAL 页表索引，多个读进程（Host A、Host B）可以直接通过共享内存定位最新快照，毫秒级读取，全程不持任何物理排他锁；
3. 被动合并 Checkpoint：当 WAL 日志积累到阈值（默认 1000 页）或连接闲置时，SQLite 会在后台自动将日志合并回主库，不干扰正在进行的查询。

在多 Agent 协同场景下，这一机制让所有的状态轮询与状态看板查询变成了完全无锁的轻量操作。

![多智能体协作底座并发博弈与哲学对抗]({{ '/assets/images/illustration-sqlite-wal-concurrency-dialectic.jpg' | relative_url }})

## 四、 拒绝长事务：SQLite 锁真相与短事务 CAS 租约

在解决守护进程互斥时，我们遇到了整个存储层设计中最深刻的一次认知碰撞。

当时，为了防止用户同时启动两个 FerryCat 守护进程导致重复接单，需要实现一个互斥锁。最初的提议非常符合传统数据库直觉：“在启动时执行 `BEGIN IMMEDIATE`，由持锁的守护进程一直保持连接不提交事务，以此霸占锁；退役时再提交”。

这个想法被迅速推翻，因为它忽略了 SQLite 的底层物理规约：SQLite 没有行级锁。

如果一个长任务持有着 `BEGIN IMMEDIATE`，它会直接霸占整个数据库的写保留锁（RESERVED Lock），任何其他行都无法被触碰。在此期间：
* 外部任何 Agent 尝试派发工单（`dispatch`）或更新状态，都会被硬生生卡满 5 秒然后抛出 `SQLITE_BUSY` 异常；
* 更致命的是，WAL 模式依赖空闲间隙执行 Checkpoint。长事务霸占锁会导致日志无法回写主库，`-wal` 文件在几小时内膨胀到数百兆，彻底破坏磁盘气密性。

协作治理的目标绝不是用大锁瘫痪全库，而是保证局部原子性。我和 AI 搭档共同推演后，确立了**短事务原子 CAS**（Compare-And-Swap）的租约模型。

我们在数据库中建立了一张专门的 `daemon_locks` 租约表：

```sql
CREATE TABLE IF NOT EXISTS daemon_locks (
  id TEXT PRIMARY KEY,
  owner_token TEXT NOT NULL,
  pid INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

当守护进程想要获取或续订锁时，它绝不开启任何长期长事务，而是执行一条极其紧凑的原子 UPSERT 语句：

```sql
INSERT INTO daemon_locks (id, owner_token, pid, expires_at, updated_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  owner_token = excluded.owner_token,
  pid = excluded.pid,
  expires_at = excluded.expires_at,
  updated_at = excluded.updated_at
WHERE daemon_locks.expires_at < ?;
```

这条 SQL 的精妙之处在于：
* 抢占与续约全部在单条 SQL 的隐式微秒级写事务内完成；
* 只有当租约已过期（`expires_at < now`）或者记录不存在时，更新才会成功；
* 借助驱动返回的 `changes === 1` 判断是否抢占成功，未抢到的进程立即退避，全程持锁时间不超过 50 微秒。

整个数据库的写锁在微秒级时间内即刻释放，既保证了守护者的唯一性，又把整库的并发通路完整归还给了业务状态机。

## 五、 防御性细节：两阶段先读后写

在轮询模块的实现中，还有一处容易被忽视的性能损耗：超时工单的清理。

每次 Agent 调用 `poll_next_task` 时，系统都需要检查是否有超时未完成的工单并将其标记为 `TIMED_OUT`。如果每次轮询都盲目执行：

```sql
UPDATE contracts SET status = 'TIMED_OUT' WHERE ... AND ? > deadline;
```

即使用户当前根本没有超时工单，这条无意义的写语句也会在每次轮询时强行向 WAL 文件追加一条事务记录，造成不必要的锁竞争。

我们落地了严格的先读后写两阶段防御策略：
1. 轻量读嗅探：先执行一条无锁的 `SELECT COUNT(*) FROM contracts WHERE ...` 判定是否存在超时残局；
2. 按需升级写：仅当统计数字大于 0 时，才显式升级写事务去更新状态。

这种克制的防御设计，将日常高频轮询对 WAL 写入流的侵扰降到了绝对最低点。

## 六、 代价与适用边界

作为秉持工程求真的 Product Engineer，我必须坦诚指出这套极简架构的代价与物理边界，软件工程世界里绝无万能药：

1. 单写者串行限制：SQLite WAL 允许多读，但任何时刻物理上依然只允许一个写事务。在单机桌面环境下，2~5 个 Agent 每分钟几十次的工单流转毫无压力（单次写耗时 $<0.5\text{ms}$）；但如果你的场景是数百个 Agent 进行每秒数千次的高频并发写入，SQLite 会迅速遭遇写队列瓶颈，此时必须转向分布式专业存储；
2. 禁止跨网络文件系统（NFS/SMB）：SQLite WAL 的共享内存（`.shm`）严重依赖宿主操作系统的本地内存映射原语（`mmap`）。严禁将 `mesh.db` 存放在 NAS 或网络共享盘上运行，否则会导致锁失效并直接损坏数据文件；
3. 实验性标志维护：依赖 Node.js 内置 `node:sqlite` 意味着启动命令必须携带 `--experimental-sqlite`。在 Node.js 官方正式将其稳定化之前，需要持续跟踪上游 API 的细微调整。

## 七、 结语：极简即自由

回顾 FerryCat 协作底座的演进，我们避开了浮夸的重型架构，用看似古朴的单文件 SQLite WAL 搭建出了一座坚不可摧的本地总线。

它免去了外部服务的配置负担，抹平了跨宿主运行时的环境泥潭，让开发者在无网、离线的极端环境下依然能获得毫秒级的确定性协作体验。真正的 **AI 工作流编排**、**确定性工作流** 与 **DAG 状态机**，往往就诞生在对这些底层物理特性的严谨敬畏之中。

底座的数据总线已经稳固扎根，但另一个关键问题随之而来：当多个下属 Agent 走进这间会议室开会时，我们如何确保它们手里拿到的代码文件是最新存盘的基线，而不是各执一词的陈旧幻象？

下一篇，我们将深入代码防脏读的核心防线：拆解全文件 SHA-256 物理指纹与 ADR-0004 缓冲机制。

---

> **专栏与开源项目**  
> **FerryCat（跨宿主 AI 智能体契约编排中枢）**：[https://github.com/GuoBug/FerryCat](https://github.com/GuoBug/FerryCat)  
> 欢迎 Star 关注或提交 Issue 交流。本专栏全部演进过程与实录工单均已在仓库内完全开源。
>
> **关于作者**  
> **郭强 (GuoBug)**，Product Engineer，做平台工程也做业务增长。目前主要在折腾 AI 工作流编排、DAG 状态机与确定性系统架构。  
> 开源项目与主页：[https://github.com/GuoBug](https://github.com/GuoBug) · [https://gu0bug.github.io](https://gu0bug.github.io)  
> 欢迎就工作流引擎架构、拓扑调度和低门槛开发体验交流指教。
