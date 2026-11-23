---
layout: post
title: "给普通用户的 EdgeCat 使用说明书：装在自己电脑或 NAS 上的 AI 流量总管与隐私门卫"
title_en: "EdgeCat Explained for Everyday AI Users: A Local-First AI Traffic Manager and Privacy Guard for Your PC or Home NAS"
date: 2026-11-23 22:30:00 +0800
categories: [AI, Product, Engineering]
pub_tag: "Local-First AI Gateway & Everyday Scenarios"
math: false
read_time: "12 MIN READ"
summary: "过去一个多月，我借助 AI 辅助编程把 EdgeCat 从最初的防泄密小工具，一路推进到了完整的本地优先 AI 推理治理网关（覆盖智能分流、流式隐私打码还原、家庭 NAS 多设备共享配额、JSON 格式守门员，以及最新落地的插件插槽与可选本地记忆）。本文不堆砌底层代码细节，而是面向普通 AI 用户、独立开发者与极客家庭，用大白话和三个真实生活办公场景，讲清楚 EdgeCat 到底帮你解决了什么麻烦、三分钟怎么用起来，以及它明确不做什么。"
summary_en: "Over the past month, through AI pair programming and learning by doing, EdgeCat has evolved from a small PII redaction proxy into a complete local-first AI inference governance gateway—spanning local-first smart routing with cloud fallback, zero-leak streaming PII rehydration, homelab NAS multi-device token & daily quota governance, non-streaming JSON repair, and opt-in layered local memory. Written for everyday AI users, indie developers, and small teams rather than low-level systems specialists, this overview explains what EdgeCat actually does through three concrete daily scenarios, a 3-minute setup walkthrough, and an honest account of its trade-offs and boundaries."
tags: [AI Workflow Orchestration, DAG Engine, State Machine, EdgeCat, Local-First, Homelab, Privacy, Ollama, Go, Product Engineering]
series: "EdgeCat · Local-First AI Inference Governance"
---

> 项目开源地址：[GitHub - EdgeCat](https://github.com/GuoBug/EdgeCat) · 完整演进路线与架构决策：[Roadmap 需求路线图](https://github.com/GuoBug/EdgeCat/blob/main/docs/roadmap_zh.md) · [ADR-0002 定位与家庭内网治理](https://github.com/GuoBug/EdgeCat/blob/main/docs/adr/0002-positioning-and-homelab-governance_zh.md) · [ADR-0004 可选分层记忆插件](https://github.com/GuoBug/EdgeCat/blob/main/docs/adr/0004-opt-in-layered-memory-plugin_zh.md)  
> 前篇专栏回顾：👉 [流式 SSE 遇上 Token 截断：EdgeCat 如何用帧级滑动窗口实现零泄漏的 PII 脱敏还原]({{ '/posts/2026/11/15/edgecat-sliding-window-sse-pii-rehydration-and-lossless-passthrough/' | relative_url }}) · [当 PatchCat、FerryCat 与 EdgeCat 合体：我对“主权 AI 运行时”的未来愿景与工程边界]({{ '/posts/2026/11/15/patchcat-ferrycat-edgecat-sovereign-ai-runtime-vision/' | relative_url }})

{% raw %}
**EdgeCat** 是一个装在你自己电脑或家里 NAS 上的“AI 流量总管 + 隐私门卫”。它体积小、只有一个单文件（纯 Go 静态编译，零外部依赖），只要把你平时用的聊天软件（如 Chatbox、Cherry Studio）、编程助手或 **AI 工作流编排** 工具的 API 地址改成本地 EdgeCat，它就会自动帮你管好四件事：优先白嫖本地免费模型、本地卡壳时无缝切云端兜底、敏感隐私出网前自动打码回来无感还原、以及给多台设备的云端账单加上每日硬上限。

前两篇关于 EdgeCat 的文章写得偏底层，聊的都是滑动窗口、双游标切分和字节流状态机。有朋友看完后私信我：“原理挺硬核，但我平时就用用 Cherry Studio、Ollama 和几个自动化脚本，这玩意儿到今天为止到底做成了什么样？对我这种普通用户有什么用？”

正好 EdgeCat 刚刚完成了 Phase 1、Phase 2 以及 Phase 3 的核心扩展与本地记忆里程碑，我也借这个节点停下来，抛开晦涩的底层术语，写一篇面向普通用户的阶段性总结：用大白话和几个真实场景，说说它现在到底能帮你干什么。
{% endraw %}

![EdgeCat 给普通用户的本地优先 AI 流量总管与隐私门卫 封面油画]({{ '/assets/images/cover-edgecat-sse-sliding-window-rehydration.jpg' | relative_url }})

{% raw %}
---

## 一、 一眼看懂：装了 EdgeCat 和没装有什么区别？

如果你平时既想用本地模型（比如 Ollama 跑的 Qwen、DeepSeek）省钱保隐私，又离不开云端大模型（如 OpenAI、DeepSeek API）的稳定与聪明，你可能早就遇到过下面这些烦心事：

| 日常遇到的烦心事 | 没装 EdgeCat 时的裸奔体验 | 装上 EdgeCat 之后的体验 |
| :--- | :--- | :--- |
| 想省钱用本地模型，但怕卡死 | 显卡忙或本地 Ollama 睡着了，聊天软件一直转圈报错，得手动切模型 | 本地并发满载或 3.5 秒不出字，在屏幕吐字前自动无缝切云端，全程无感 |
| 聊天里顺手贴了手机号或密钥 | 明文直接发给公网云端服务器，每次发之前都得人工肉眼删半天 | 出网前在内存中自动打码成代号，回来时屏幕自动换回真号码，硬盘不留底 |
| 家人或队友也想用你的 API | 把几百块余额的主 API Key 直接发给别人，用超了或泄露了全盘遭殃 | 主 Key 锁在家里 NAS 里，按设备发可撤销子令牌，本地随便用、云端设每日限额 |
| 跑自动化脚本要求返回 JSON | 小模型动不动多嘴包一层代码框，导致脚本解析直接崩溃 | 非流式场景下自动剥掉多余外壳，格式不对还会受控自动帮它修一次 |
| 想让 AI 记住背景，又怕隐私串台 | 聊天记录全堆云端，或者多台设备混在一起互相看到对方隐私 | 可选开启本地分层记忆插件，按设备硬隔离、支持中文检索、入库前强制脱敏 |

下面这张全景图，就是一条 AI 请求经过 EdgeCat 时走过的完整路线：
{% endraw %}

<p align="center">
  <img src="{{ '/assets/images/flowchart-edgecat-user-scenarios-overview.svg' | relative_url }}" alt="EdgeCat 全景图：普通用户的 AI 请求如何安全省钱地走完一趟" width="960" height="520" loading="lazy" decoding="async" />
</p>

{% raw %}
---

## 二、 三个真实场景：EdgeCat 在生活和工作里怎么用？

与其干巴巴地罗列功能清单，不如直接看三个最贴近日常的使用画面。

### 场景一：一个人的日常办公与写代码（省钱 + 防手滑泄密）

假设你平时在自己电脑上用 Cherry Studio 或 Chatbox 处理日常工作：润色邮件、整理客户通话纪要、翻译技术文档，顺便还在本地跑着 Ollama（比如 `qwen2.5:7b`）和几个 **确定性工作流** 脚本。

没有 EdgeCat 的时候，你得在客户端里来回切换配置：简单活切本地，怕慢又得切云端；每次把客户发来的微信记录贴进对话框，都要提心吊胆地检查里面有没有漏掉对方的手机号、邮箱、公司内网 IP（如 `192.168.1.50`）或者测试环境的 `sk-` 密钥。

把客户端地址指向本机的 `http://127.0.0.1:8080/v1` 之后，日常就变成这样了：
1. 你统一只选一个名字（比如 `default` 或 `gpt-4o-mini`），剩下的交给 EdgeCat。平时电脑闲着，请求直接走免费的本地 Ollama，零费用；
2. 某天你正好在后台导出视频，显卡满载了，本地模型 3.5 秒还没吐出第一个字。EdgeCat 不会让你干等报错，在屏幕还没开始打字前，悄悄把这次请求重写并转给云端模型兜底；
3. 如果这次请求里夹着客户手机号 `13800138000` 和测试密钥，EdgeCat 在把请求发往公网前，会在内存里把它们替换成 `{{EC_PII_PHONE_1}}` 这类代号；云端大模型看到的只是代号，等它一个字一个字把回复流式传回来时，EdgeCat 又在你的屏幕上实时还原回 `13800138000`。

你眼睛看到的是一次完全正常的流畅对话，但真实的敏感信息压根没离开过你的电脑。而且如果你对某些文档极其敏感，甚至可以把隐私策略设为 `local_only`——只要内容里命中了敏感词，就强制锁死在本地算力里处理，宁可不走云端也绝不出网。

### 场景二：家里一台 NAS 或 Mac mini，全家 / 2~3 人小团队安全共享

这是很多极客家庭或两三人独立工作室的真实痛点：家里书房或工作室放了一台常开的 Mac mini、老旧主机或者带显卡的 NAS，大家都想用 AI，但又不想给每个人都去注册账号、绑信用卡，更不敢把充了钱的 OpenAI 主 API Key 直接贴到家人的平板或队友的电脑上。

把 EdgeCat 单文件丢到这台 NAS 上，你就能在几分钟内搭出一个带安全门卫的局域网共享站：
1. 强制门卫防裸奔：EdgeCat 默认只允许本机访问（`127.0.0.1`）。一旦你把监听地址改成局域网，程序启动时会自动检查你有没有开启鉴权并配置设备令牌——如果没开，它直接拒绝启动，防止你手滑把算力敞开在局域网里裸奔；
2. 主 Key 锁死，按人发子令牌：你把云端主 API Key 锁在 NAS 的配置文件里，然后给自己的笔记本发一个 `macbook-workstation` 令牌，给家人的 iPad 发一个 `family-tablet` 令牌，给队友发一个独立令牌。哪天谁不共用，删掉那一行令牌即可，不用到处换主 Key；
3. **本地算力免费无限用，云端降级按设备每日硬限额**：大家平时问问题，优先蹭 NAS 上的免费本地模型，聊一万句也不扣额度；只有当本地忙不过来触发云端降级时，才开始扣除对应设备的每日云端次数（比如给自己设每天 500 次，给家人平板设每天 50 次，给测试脚本设 `-1` 严禁走云端）。计数直接存在本地 SQLite 里，NAS 重启也不会清零，彻底防住脚本死循环或前端异常刷爆信用卡。
{% endraw %}

![家庭 NAS 共享网关与隐私配额金库 抽象油画插图]({{ '/assets/images/illustration-edgecat-token-slicing-brace-trap.jpg' | relative_url }})

{% raw %}
### 场景三：接上自动化工作流与可选本地记忆（稳健输出 + 各记各的账）

当你不再满足于单次聊天，开始用 PatchCat 这类可视化 **DAG 状态机** 或 Python 脚本批量处理数据时，普通模型有两个让人抓狂的毛病：一是让你输出纯 JSON，它偏要在外面套一层 ````json` 和客套话，害得下游程序解析失败；二是换一个新会话，它就把你之前交代过的偏好忘得一干二净。

EdgeCat 在这两件事上也补齐了拼图：
- JSON 格式守门员：在非流式接口请求 JSON 格式时，EdgeCat 会自动帮你剥掉多余的代码块外壳；如果剥完之后还是语法报错，它会自动发起最多 1 次轻量修复（有严格超时上限，绝不陷入无限重试烧钱）；
- 协议原样透传：无论你用的是 DeepSeek 的深度思考链（`reasoning_content`）、Agent 的工具调用（`tools` / `tool_calls`），还是发图片的多模态对话，EdgeCat 都不做破坏性改写，原样透传；
- 可选本地分层记忆（默认关闭）：这是最近刚刚落地的新能力。开启后，EdgeCat 可以在本地 SQLite 里按“长期事实 + 短期摘要”两层保存上下文，自带纯 Go 实现的中文全文检索（无需安装任何 C++ 分词插件），而且严格按设备隔离——你笔记本上的记忆，家人平板绝对查不到。更关键的是，所有记忆入库前都会强制脱敏，绝不存一句明文手机号或密钥；配合本地 HMAC 密钥，同一个客户号码在不同天的对话里会被稳定映射成同一个代号，既能跨天连贯回忆，又不牺牲隐私底线。

---

## 三、 项目到现在到底实现了什么？（完整能力盘点）

把上面这些场景拆开来看，截至目前，EdgeCat 已经完整走完了 Roadmap 上的 Phase 1、Phase 1.5、Phase 2 以及 Phase 3 的插件与记忆里程碑，沉淀出了五大块开箱即用的能力：

1. 双轨智能调度与三态熔断：EdgeCat 用明确的并发槽位（`max_concurrent_local`）和首字计时器（默认 3.5 秒）决定是否切云端，不靠猜测电脑内存占用。如果本地 Ollama 彻底挂了，连续失败 3 次后熔断器会直接断开半分钟，期间所有请求秒走云端，不再每次傻等 3.5 秒；冷却结束再放 1 个探测请求看本地是不是活过来了。
2. 全链路流式隐私保护与 **零明文隐私落盘**：支持中国大陆手机号、邮箱、内网 IPv4、常见 API Key，以及可选开启的 18 位身份证号和银行卡号。打码映射只活在单次请求的内存里，请求结束立刻销毁；即使大模型按字吐出时把代号劈成了两半，帧级滑动窗口也会把它无损拼回来。同时默认禁止把 API Key 还原进工具调用参数里，防一手间接 Prompt 注入套取密钥。
3. 家庭/小团队内网安全与静默记账：涵盖局域网 Fail-Closed 启动门卫、多设备子令牌、每日云端硬配额、受控跨域（支持浏览器里的 PatchCat 网页直接连本机或 NAS 网关），以及后台异步 SQLite 记账本——只记“哪台设备、走了本地还是云端、耗时多少、拦了几个敏感词”，既不拖慢打字速度，也绝不偷存聊天正文。
4. 格式护栏与无损透传：非流式 Strict JSON 自动清理与单次自修；长文本流式输出采用“空闲超时”而非“总时长一刀切”，本地慢速模型慢慢写几分钟长文也不会被网关中途腰斩。
5. 双阶段插件插槽与可选本地记忆：通过标准化的 `RequestMutator` 接口（打码前 + 打码后两个挂载点），让自定义规则和本地分层记忆以插件形式接入，不把主网关写成一个臃肿的大泥球。

---

## 四、 坦诚复盘：我与 AI 搭档“边写边学”的几个关键节点

这个项目不是我关起门来纯手敲出来的，而是我全程借助 AI 辅助编程，在“干中学”的过程中一点点推演、实测、打磨出来的。回看这一个多月的开发历程，真正决定 EdgeCat 走向的，是几个双向启发的架构节点：

- 我提出来的业务与体验节点：比如“家里 NAS 想给多台设备共用，但绝不能把主 API Key 发出去，还要能防家人平板或死循环脚本刷爆云端账单”、“不能为了加个记忆功能就把原本干净的单文件搞成一堆 C++ 依赖”、“普通用户用 Chatbox 改个地址就得能连上，不能要求改客户端代码”。
- AI 帮我揪出来的底层隐患节点：当我顺手想在字节流外层套个正则做流式还原时，AI 指出 SSE 的 JSON 外壳字符会把滑动窗口冲坏，而且思考链、正文、工具参数三条流会互相串台；当我准备把本地记忆直接挂到同一个 SQLite 连接上时，AI 提醒我热路径读查询会被写锁卡住，于是我们拆出了“单写连接 + 多读只读连接池”；做局域网共享时，AI 也提醒必须把默认的“宽容放行”改成“Fail-Closed 默认拒绝”，并补上跨帧双花括号劈裂和熔断器并发重置的边界。

每遇到这些节点，我都没有直接要一段黑盒代码贴进去就完事，而是先弄明白不同方案的利弊，再自己读代码、查文档，专门写出一堆刁钻的自动化测试用例（比如故意把占位符末尾的两个 `}}` 拆到两个数据包里、模拟本地模型吐到一半突然断网、并发压测每日配额有没有超发、验证 `alice` 的记忆绝不会漏给 `bob`），亲眼看到所有边界测试稳稳通过，心里才算踏实。
{% endraw %}

![确定性本地记忆与真实工程边界 抽象油画插图]({{ '/assets/images/illusion-three-pillars-convergence.jpg' | relative_url }})

{% raw %}
---

## 五、 它不做什么？以及必须讲清楚的代价与边界

任何工具都不可能包打天下，把边界和代价提前说透，用起来才不会踩坑。EdgeCat 有几条非常明确的能力边界和“明确不做清单”：

1. 隐私打码不是读心术：内置规则靠结构特征识别手机号、邮箱、IP、密钥、身份证和银行卡。如果你在聊天里用大白话写“我银行卡密码是家里小猫生日加三个八”，正则是看不懂的。遇到这类非结构化绝密信息，正确的用法是直接把策略设为 `local_only` 或配额设为 `-1`，从物理路径上锁死只走本地模型。
2. 本地切云端会有一次等待代价：当本地模型卡住触发 3.5 秒超时降级时，这 3.5 秒的等待是真实发生的，随后才会切到云端重算；而且一旦本地已经开始往屏幕上吐字，中途突然断流会直接返回报错，不会再切云端（否则屏幕上一半本地一半云端就乱套了）。
3. JSON 格式自修只管非流式：因为必须等整段话写完才能检查 JSON 合不合法，流式打字机模式下无法做自修，这属于流式体验与强格式校验之间的天然取舍。
4. 本地中文记忆有 3 字匹配下限：为了保住单文件零 C++ 依赖，中文全文检索用的是 SQLite 内置的 `trigram`（三字切分），所以藏在长句子里的两字短词不会命中全文索引（独立搜两字短词时会自动回退到模糊查询）；同时为了不拖慢对话速度，网关不会在聊天过程中偷偷调大模型帮你总结记忆，记忆条目由外部脚本或工作流离线写入。
5. 明确不做公网多租户计费后台：EdgeCat 的定位是个人工作站和家庭/小团队内网守护进程，不做充值计费、不做花哨的网页管理大屏，也严禁在没有鉴权和加密隧道保护的情况下直接裸奔暴露到公网。

---

## 六、 三分钟上手：普通用户怎么把它用起来？

如果你想亲自试一试，整个过程非常轻巧：

1. 编译出一个绿色单文件（需要本机装有 Go 1.26+）：
   ```bash
   git clone https://github.com/GuoBug/EdgeCat.git
   cd EdgeCat
   make build
   ```
   执行完后，你会在 `bin/edgecat` 拿到一个不依赖任何外部动态库的单文件。

2. 抄一份配置，填上你的本地和云端地址：
   复制 `configs/edgecat.example.yaml` 改成自己的配置，填好本地 Ollama 地址（默认 `http://127.0.0.1:11434/v1`）和云端保底 API Key，然后启动：
   ```bash
   ./bin/edgecat -config configs/edgecat.example.yaml
   ```

3. 在你的聊天软件里改一下地址：
   打开 Chatbox、Cherry Studio 或 NextChat，API 类型选 `OpenAI API`，把 Base URL 改成 `http://127.0.0.1:8080/v1`（如果是 NAS 共享，就填局域网 IP 和对应的子令牌），模型选 `default` 或 `gpt-4o-mini`，就可以直接开聊了。

---

## 七、 接下来打算做什么？

到今天为止，EdgeCat 在架构和功能层面已经基本成型，短期内我不会再盲目堆砌新特性。接下来最重要的一件事，是 Roadmap 里的最后一项 **R3.3：90 天真实生产运行实测**——把它老老实实挂在我的主力工作站和家庭 NAS 上，搭配 PatchCat 和日常聊天软件连续跑上三个月，攒一份真实的运行数据（本地 7B 模型到底能接住多少流量、云端降级触发频率如何、实际省下了多少账单），再回来写一篇基于真实数据的复盘。

我本身水平有限，EdgeCat 也是在边写边学中一路迭代出来的。如果你在日常使用本地模型、搭建家庭 NAS 共享网关，或者设计隐私脱敏与工作流编排时有更好的思路，非常欢迎到 GitHub 提 Issue、做 Code Review，一起交流指教。

---

> 专栏与开源项目  
> EdgeCat（本地优先 AI 推理治理网关）：[https://github.com/GuoBug/EdgeCat](https://github.com/GuoBug/EdgeCat)  
> PatchCat（前端可视化 AI 工作流编排器）：[https://github.com/GuoBug/PatchCat](https://github.com/GuoBug/PatchCat)  
> FerryCat（跨宿主 AI 智能体契约编排中枢）：[https://github.com/GuoBug/FerryCat](https://github.com/GuoBug/FerryCat)  
>
> **关于作者**  
> **郭强 (GuoBug)**，Product Engineer，做平台工程也做业务增长。目前主要在折腾 AI 工作流编排、DAG 状态机与确定性系统架构。  
> 开源项目与主页：[https://github.com/GuoBug](https://github.com/GuoBug) · [https://guobug.github.io](https://guobug.github.io)  
> 欢迎就工作流引擎架构、拓扑调度和低门槛开发体验交流指教。
{% endraw %}
