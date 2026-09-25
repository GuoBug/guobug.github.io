---
layout: post
title: "从 0 到 1 打造 AI 提示流编排器：把 AI 引擎塞进华硕路由器！Merlin 插件与轻量边缘网关实战（开源系列 12）"
title_en: "Building AI Prompt Orchestrator: Embedding AI into ASUS Routers — Merlin Plugin & Lightweight Edge Gateway"
date: 2026-09-22 21:45:00 +0800
categories: [AI, EdgeComputing, Router]
pub_tag: "Edge Computing"
summary: "一方面为了实测 PatchCat 在极端严苛资源下的轻量运行极限，另一方面源于作者长期折腾路由器插件的极客情怀。深度复盘如何将 AI 工作流编排引擎塞进华硕 RT-AX86U 路由器：纯 Go 打造 3MB 零依赖边缘网关，攻克板载 NAND 闪存磨损致命隐患，让家庭局域网秒变免 PC 常开的私有 AI 编排中枢。"
summary_en: "Exploring the extreme resource boundaries of PatchCat while indulging in a long-standing passion for router firmware tweaking. A deep dive into porting an AI workflow orchestrator onto an ASUS RT-AX86U router: building a 3MB zero-dependency Go edge gateway, mitigating NAND flash wear-out risks, and turning a home network into an always-on AI automation hub."
read_time: "12 MIN READ"
tags: [AI, PatchCat, Asuswrt-Merlin, Router, Edge Computing, Go, ARM64, Local First, Open Source]
series: "PatchCat · AI Prompt Flow Orchestrator"
---

> **项目开源地址**：[https://github.com/GuoBug/PatchCat](https://github.com/GuoBug/PatchCat)  
> **在线体验**：[https://guobug.github.io/PatchCat/](https://guobug.github.io/PatchCat/)  
> **往期回顾**：  
> 📖 [《从 0 到 1 打造 AI 提示流编排器：给大模型装上手和脚！Agent 节点与 Tools 工具调用体系设计与实战（开源系列 09）》]({{ '/posts/2026/09/13/ai-prompt-orchestrator-agent-tools-reactive-loop/' | relative_url }})  
> 📖 [《从 0 到 1 打造 AI 提示流编排器：酒香也怕巷子深，如何让用户真正接受产品？空白画布引导与场景模板实践（开源系列 10）》]({{ '/posts/2026/09/18/ai-prompt-orchestrator-onboarding-template-gallery/' | relative_url }})  
> 📖 [《从 0 到 1 打造 AI 提示流编排器：鞋里有沙走不远，怎么让画布连线真正顺手？（开源系列 11）》]({{ '/posts/2026/09/19/ai-prompt-orchestrator-canvas-ergonomics-spatial-collision/' | relative_url }})

---

> [!IMPORTANT]
> **关于本版本的性质与支持边界声明（Experimental PoC）**  
> 1. **定位界定**：本移植版本属于**“极端受限环境下架构轻量性的验证原型（Experimental PoC）”**，旨在验证 PatchCat 纯客户端内核的资源下限，非官方主线长期主力维护形态；  
> 2. **支持边界**：仅在特定的硬件与固件（**Asuswrt-Merlin 388.2_2 / ASUS RT-AX86U / Broadcom BCM4908 ARM64 HND**）上完成实测。不保证向后兼容其他平台/型号（如 MIPS 架构或老旧原厂固件），团队不承担路由器刷机、非核心环境适配等支持答疑；  
> 3. **零增量维护**：插件包解压后本质是静态前端文件与基础启动脚本，打包流程已直接集成在主库 GitHub Actions Release 流水线中自动归档，无独立分支与长期发版包袱。

---

![把 AI 引擎塞进路由器：Merlin 插件与轻量边缘网关]({{ '/assets/images/merlin-router-ai-orchestrator-hero.png' | relative_url }})

## 一、 为什么要把 AI 编排引擎塞进路由器？

在上一篇关于画布工效学的文章里，我们花了不少心思打磨连线防碰撞与撤销重做。但在项目演进的过程中，我和身边的极客朋友始终面临一个很实际的现实矛盾：

**大家都很想要一个 7x24 小时随时待命的私有 AI 工作流中枢。**

比如，你写好了一个自动监控行业动态并生成简报的工作流，或者搭好了一个随时可以在手机上查阅资料的客服 Agent。但现实是：
- **云服务器太贵太重**：主流开源编排框架（如 Dify、Langflow）动辄需要起一套庞大的 Docker Compose，挂着 PostgreSQL、Redis 和 Celery，没有一台 4G/8G 内存的云主机根本跑不起来，每个月几十上百的月租对于个人玩家而言是不小的开销；
- **PC 本地常开太累**：在自己的开发机上跑当然省钱，可一旦笔记本合盖或者台式机休眠，正在运行的服务和外链 API 瞬间断线。

这时候，我把目光投向了家里弱电箱里那个常年插着电、默默工作的千兆路由器——**华硕 RT-AX86U**。

促成这次移植尝试，核心源于两大驱动力：

1. **其一，为了验证 PatchCat 到底有多“轻”**：  
   我们从第一天起就确立了 **100% 纯前端 + 边缘优先（Local-First）** 的架构路线，主打冷启动 <300ms、无后台数据库依赖。但这到底是不是“王婆卖瓜”？检验架构轻量性的最好试金石，不是动辄上百核的云服务器，而是算力有限、内存极度金贵的嵌入式边缘设备！
2. **其二，自己骨子里就是个爱折腾路由器插件的老玩家**：  
   从早年刷 OpenWrt、梅林固件（Asuswrt-Merlin），再到 Koolshare / Koolcenter 的软件中心，我平时就极其热衷于折腾各种路由固件与后台插件。如果能把大模型工作流直接打包成一个标准的路由器插件，让家里的千兆路由秒变本地 AI 调度中枢，这本身就是一件充满乐趣且极酷的事。

而且打个伏笔：虽然这样做非常拧巴，但是**今天既然能塞进路由器，以后顺理成章，我也很想给家庭 NAS（群晖、威联通或极空间）做一套开箱即用的轻量套件。**

---

## 二、 嵌入式边缘场景的工程权衡（Trade-offs）

想把应用搬上路由器，和在常规 Linux 服务器上跑程序有着天壤之别。路由器是一个对资源极度苛刻、甚至“碰一下就会烧芯片”的特殊环境。

在和 AI 伙伴结对推演架构方案时，我们迅速排除了传统方案，确立了必须跨越的四大硬核关卡：

![路由器极端物理约束 vs 系统级工程破局方案]({{ '/assets/images/router-constraints-vs-solution-architecture.png' | relative_url }})

### （一）选型权衡：彻底放弃 Python，重构 3MB 静态 Go 网关

PatchCat 原生拥有一套基于 FastAPI 的服务端实现。但在华硕路由器上，这套方案第一分钟就被判了死刑：
- 路由器的系统基于精简版 Linux（Asuswrt），底层缺失完整的 glibc 和包管理器；
- 哪怕想办法交叉编译一套 Python 运行时，解压后体积轻轻松松突破 150MB，足以把路由器的闪存撑爆；
- Python 多进程常驻内存动辄 200MB+，一旦家庭网络突发大流量，路由器可能直接内存溢出（OOM）而断网死机。

**最终决策**：  
彻底放弃重型解释器，专门使用 **Go 语言** 编写了一个专为路由器定制的边缘网关（`patchcat-server`）。
利用 Go 卓越的跨平台交叉编译能力，剥离调试符号后，生成一个单一可执行二进制文件：
- **静态无依赖编译**：`CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o patchcat-server`；
- **极限体积**：未压缩二进制仅约 5.5MB，打成 `.tar.gz` 插件发布包后**只有不到 3MB**！
- **超低内存开销**：常驻运行内存仅需 **18MB ~ 25MB**，对千兆路由器的日常转发性能完全零打扰。

---

## 三、 人机共创关键节点：攻克路由器 NAND 闪存磨损致命隐患

在这次移植攻坚中，最让我感到后怕也最体现人机协同价值的，是一个关于**硬件寿命**的深层技术隐患。

### （一）致命隐患：别把昂贵的路由器写成了“板砖”

起初，我的直觉想法很简单：“既然要做持久化，就把历史数据和配置保存在路由器的 `/jffs` 分区呗，每次工作流执行完顺手写条日志。”

但在代码审查的关键节点上，AI 搭档立刻在系统底层敲响了警钟：

> **AI 提醒**：  
> “家用路由器的 `/jffs` 分区是焊死在主板上的 NAND Flash（闪存）。它的物理擦写寿命（P/E Cycles）非常有限（通常只有几万次甚至几千次）。  
> 如果像常规服务器那样，在工作流调度过程中高频写入 SQLite 日志、更新节点快照，成百上千次的频繁小文件写入，极可能在几个月内把路由器的 NAND 闪存直接写废，导致整台路由器无法开机变砖！”

查阅华硕官方固件源码与 Asuswrt-Merlin 开发者维基后，我完全印证了这一判断——这是许多业余路由器脚本作者最容易踩爆的惊天大坑。

### （二）双重防线：闪存磨损保护机制（Flash Wear-out Protection）

为了让大家用得安心，绝不损伤路由器硬件寿命，我们设计了极其严苛的**内存优先防线**：

1. **内存虚拟盘重定向（RAM Disk Redirect）**：  
   所有运行期日志、Token 统计与调度状态，全部强制重定向到路由器的 `/tmp/patchcat/` 内存目录。  
   在 Asuswrt 架构下，`/tmp` 是纯内存挂载（tmpfs），读写速度高达每秒几百兆，且无论高频读写多少次，**对底层物理闪存磨损为绝对的零**！
2. **默认物理落盘熔断**：  
   在网关配置中将持久化默认写死为 `storage.enabled = false`。
3. **WebUI 醒目风险对齐**：  
   在路由器的管理配置界面（`Module_patchcat.asp`）上，我们放置了非常醒目的安全提示：仅当用户插上外置 USB 移动硬盘并挂载到 `/mnt` 时，才允许开启持久化存储；如果检测到用户试图将落盘目录设为 `/jffs`，系统将直接弹出红色二次确认拦截！

通过严谨的硬件边界设防，我们彻底解除了极客玩家在路由器上玩大模型的后顾之忧。

---

## 四、 核心特性：路由器边缘网关带来了什么？

把 PatchCat 装进路由器，绝不只是为了“炫技”，它带来了极为实用的边缘级优势：

### 1. 天然消除跨域（CORS）与网络路由障碍
前端直接在浏览器调用海外大模型 API 时，经常受制于浏览器的 CORS 跨域策略，或者本地 PC 缺少透明代理环境。  
现在，所有的 LLM 请求统一发往路由器本地网关：
```http
POST http://192.168.50.1:8080/api/proxy/v1/chat/completions
```
路由器网关接收到请求后，直接在网络层转发，并原生建立 SSE（Server-Sent Events）长连接，将流式 Token 实时推回给前端画布。整个链路免除了客户端配代理的琐碎步骤。

### 2. 完美的 Koolcenter (ASUSGO) 插件规范兼容
我们完整遵循了华硕改版固件的插件标准目录结构：
- `patchcat/scripts/patchcat_config.sh`：负责服务的启动、停止与开机 Daemon 注册；
- `patchcat/webs/Module_patchcat.asp`：无缝嵌入华硕路由器管理后台（ROG / TUF 风格均适配），支持一键开关服务、修改端口号与查看实时运行状态；
- `patchcat/uninstall.sh`：优雅卸载脚本，清理自启项与内存进程，不留垃圾文件。

---

## 五、 实机运行验证：千兆路由秒变 AI 中枢

在我的 ASUS RT-AX86U（固件：Asuswrt-Merlin 386.14）上，我们实机测试了完整的部署与编排流程：

```bash
# 1. 登录路由器后台执行离线安装
cd /tmp
tar -zxvf patchcat_merlin_arm64.tar.gz
sh /tmp/patchcat/install.sh

# 2. 查看后台守护进程状态
ps | grep patchcat-server
# 12480 admin  18432 S    /jffs/softcenter/bin/patchcat-server --port=8080
```

安装完成后，打开路由器后台的「软件中心」，可以看到绿色的 **PatchCat** 图标已就位。

在同一局域网下的任一台设备（无论我的主力 PC、iPad 还是 iPhone），直接在浏览器输入：
`http://192.168.50.1:8080`

熟悉的 PatchCat 画布瞬间拉起！
- **冷启动响应**：页面由路由器本地静态托管，毫秒级直接渲染；
- **并发拓扑调度**：随手拖了一个三阶段客服分类与摘要工作流，点击运行，Gemini 与 DeepSeek 节点流式输出丝滑流畅；
- **路由器负载表现**：实测在并发运行工作流时，路由器博通 4 核 CPU 占用率仅在 **1.2% ~ 2.8%** 之间轻微波动，常驻内存占用仅仅只有 **18.4 MB**。

这意味着，你甚至感觉不到它的存在，但家里的局域网内已经常驻了一个永不断线的 AI 编排大脑。

---

## 六、 架构 Proof of Work：一次极端场景的工程背书

与其说这是一篇路由器玩法教程，不如说这是对 PatchCat 底层架构选型的一次 **极端韧性验证（Proof of Work）**。我们将这次实践提炼为以下架构逻辑小结：

| 维度 | 行业常态 (Heavyweight Orchestrators) | PatchCat 边缘解法 (Edge-Native PoC) | 架构收益与证明 |
| :--- | :--- | :--- | :--- |
| **痛点反思** | 多数 AI 工作流工具（Dify、LangFlow 等）强依赖重型后端（Python/Celery/Postgres/Redis），部署门槛高，动辄吞噬数 GB 宿主机内存与持续 CPU 计算底噪。 | 坚决拒绝把控制流中心化绑死在云端服务器。 | 彻底打破个人开发者与极客自建 AI 中枢的硬件成本与维护门槛。 |
| **架构解法** | 复杂的图拓扑调度逻辑、状态机与会话修剪全部由重型云端服务承载。 | 将 **DAG 拓扑解析与执行引擎 100% 移至客户端浏览器**，后端彻底退化为**轻量静态托管或薄网关**。 | 宿主机端彻底去状态化，算力做功转移到终端渲染侧。 |
| **实战验证** | 无法在嵌入式或边缘硬件上开机运行，只能运行于高性能云主机或主力 PC。 | 直接以 **华硕 RT-AX86U** 路由器作为边缘网关运行，实测常驻内存仅 **18MB**，CPU 零计算底噪。 | 铁证证明了该架构在受限边缘设备与未来私有 NAS 上的极端高韧性与适应力。 |

---

## 七、 总结与未来展望

回顾这次把 PatchCat 塞进路由器的折腾过程，是一次典型的 **Product Engineer 双轨验证**：
- **在底层**：我们用极度克制的纯 Go 静态编译、严密的内存盘重定向与闪存磨损保护，在 500MB 内存的嵌入式设备上验证了 Local-First 确定性编排的极致轻量；
- **在体验上**：我们给极客用户保留了最简单的一键安装包与 Web 管理界面，无需敲击复杂命令即可让家庭网络拥有专属的 AI 工作流网关。

正如开头所说，折腾路由插件是我的个人兴趣，但绝不仅限于路由器。

随着 Local-First 与边缘计算的浪潮推进，用户对“数据不出门、服务不花云租金、硬件充分利旧”的诉求正在变得越来越强烈。**下一步，我们正在考虑将 PatchCat 打包适配群晖（Synology DSM）、绿联与极空间等主流 NAS 系统**，让这只小猫在更多的家庭私有云设备上扎根。

本项目已全量开源，华硕 Merlin 路由器的打包构建脚本与 Go 网关代码均位于主仓库中。欢迎同样喜欢折腾软硬结合的极客朋友交流指教，共同探讨边缘 AI 的更多可能性！

---

> **关于作者**  
> **郭强 (GuoBug)**，Product Engineer，做平台工程也做业务增长。目前主要在折腾 AI 工作流编排、DAG 状态机与确定性系统架构。  
> 开源项目与主页：[https://github.com/GuoBug](https://github.com/GuoBug) · [https://guobug.github.io](https://guobug.github.io)  
> 欢迎就工作流引擎架构、拓扑调度和低门槛开发体验交流指教。

<div align="center">
  <sub>Built with ❤️ by <a href="https://guobug.github.io/about/">Guo Qiang</a> (GuoBug)</sub>
</div>
