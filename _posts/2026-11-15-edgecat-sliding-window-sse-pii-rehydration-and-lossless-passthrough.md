---
layout: post
title: "流式 SSE 遇上 Token 截断：EdgeCat 如何用帧级滑动窗口实现零泄漏的 PII 脱敏还原"
title_en: "Surviving Token Slicing in SSE Streams: Frame-Level Sliding-Window PII Rehydration and Lossless Wire Passthrough in EdgeCat"
date: 2026-11-15 20:30:00 +0800
categories: [AI, Architecture, Engineering]
pub_tag: "Streaming SSE Governance & Zero-Leak PII"
math: true
read_time: "15 MIN READ"
summary: "在本地优先的 AI 推理网关中，对提示词中的手机号、密钥与内网 IP 进行入站掩码很容易，难的是在流式 SSE（Server-Sent Events）响应中将占位符无损还原。由于大模型按 BPE Token 逐块吐字，一个完整的 EC_PII_PHONE_1 双花括号占位符随时会被劈成两半，甚至连末尾的双右花括号都会跨帧断裂。本文复盘 EdgeCat 网关的流式治理演进：从为何放弃外层字节流拦截转向 JSON 帧级三通道状态机，到单右花括号容忍算法、协议无损透传契约，以及 finish_reason 尾帧即时刷出机制，在零首字延迟损耗下守住数据隐私边界。"
summary_en: "In a local-first AI inference gateway, masking sensitive PII (phone numbers, API keys, private IPv4s) on inbound prompts is straightforward; restoring those placeholders across streaming Server-Sent Events (SSE) without data corruption is where naive proxies fail. Because LLMs emit text token-by-token, a double-brace placeholder like EC_PII_PHONE_1 is frequently sliced across adjacent SSE chunks—even right between its closing double braces. This article deconstructs EdgeCat's streaming governance architecture: why raw byte-stream buffering fails against SSE JSON envelopes, isolating per-choice 3-channel sliding windows (content, reasoning_content, tool_calls), tolerating split closing braces within a 64-byte candidate window, enforcing lossless wire passthrough via json.Number, and flushing residual tails immediately upon finish_reason."
tags: [AI Workflow Orchestration, DAG Engine, State Machine, SSE Streaming, Sliding Window, PII Masking, Go, EdgeCat, Local-First, Product Engineering]
series: "EdgeCat · Local-First AI Inference Governance"
---

> 项目开源地址：[GitHub - EdgeCat](https://github.com/GuoBug/EdgeCat) · 对应源码实现：[internal/filter/pii.go: 内存 Vault 与双游标滑动窗口](https://github.com/GuoBug/EdgeCat/blob/main/internal/filter/pii.go)、[internal/proxy/sse_rehydrator.go: 帧级三通道流式还原器](https://github.com/GuoBug/EdgeCat/blob/main/internal/proxy/sse_rehydrator.go)、[internal/proxy/protocol.go: 协议无损透传层](https://github.com/GuoBug/EdgeCat/blob/main/internal/proxy/protocol.go) 与 [internal/proxy/review_fixes_test.go: 跨帧双花括号断裂与多通道回归测试](https://github.com/GuoBug/EdgeCat/blob/main/internal/proxy/review_fixes_test.go)  
> 前篇专栏回顾：👉 [拒绝把日志当交付物：FerryCat v0.5.0 的防猜契约、智能注入与零配置沙箱]({{ '/posts/2026/11/09/never-guess-logs-as-deliverables-anti-guessing-delivery-envelope-and-safe-init/' | relative_url }})

{% raw %}
流式 PII 脱敏还原（Streaming PII Rehydration）是指在 AI 推理网关的入站阶段将敏感隐私词替换为确定性占位符存入单次请求内存，并在出站 SSE（Server-Sent Events）流式传输中通过有限状态滑动窗口跨帧拼合被分词器截断的占位符，在保持首字延迟（TTFT）不变的前提下实现客户端无感还原的流式治理机制。

在跑通了纯前端可视化的 **AI 工作流编排** 引擎（PatchCat）与跨宿主审查总线（FerryCat）之后，我开始把目光转向更底层的算力供给侧。

日常在个人工作站与家庭 NAS 上运行 **DAG 状态机** 时，我的痛点非常具体：平时绝大多数常规节点希望直接走局域网内的免费 Ollama（如 `qwen2.5:7b`），只有当本地并发满载或首字超时时，才自动降级到云端的付费 API。而一旦请求准备跨出内网发往公网云端，提示词里夹带的客户手机号、内部邮箱、内网 IPv4 地址以及 `sk-` 开头的密钥，必须先在本地网关脱敏成类似 `{{EC_PII_PHONE_1}}` 的占位符；等模型流式吐字回来时，网关再把占位符实时换回真实号码，确保下游的业务节点或工具调用拿到完整可用的参数。

这个需求听起来像是十行正则表达式就能搞定的周末小作业。但在借助 AI 辅助编程推进 EdgeCat（Go 1.26+ 纯静态编译网关）并贯彻“边写边学”的过程中，我踩进了一个几乎所有流式代理都会遇到的分词切片陷阱。
{% endraw %}

![EdgeCat 流式 SSE 滑动窗口与无损透传 封面油画]({{ '/assets/images/cover-edgecat-sse-sliding-window-rehydration.jpg' | relative_url }})

{% raw %}
---

## 一、 为什么“一把梭”正则替换在 SSE 流面前必死无疑？

在非流式（`stream: false`）场景下，网关拿到的是完整的 JSON 响应体。把整个字节切片塞进 `rePlaceholder.ReplaceAllStringFunc`，不到一毫秒就能把所有 `{{EC_PII_PHONE_1}}` 还原成 `13800138000`。

但在交互式对话与长链路 **确定性工作流** 中，为了不让用户面对长达十几秒的白屏，客户端默认都会开启 `stream: true`。此时上游大模型按照 BPE（Byte-Pair Encoding）词表一个 Token 接一个 Token 地向外吐出 SSE 数据帧。

大模型并不知道 `{{EC_PII_PHONE_1}}` 是你精心设计的神圣不可分割的原子符号。在分词器眼里，这只是一串普通的 ASCII 字符。于是在网络抓包里，你会看到上游发来的两个相邻 SSE 帧长这样：

```text
// 第 1 帧：占位符在中间被生生腰斩
data: {"id":"chatcmpl-s1","choices":[{"index":0,"delta":{"content":"请立即联系号码：{{EC_PI"},"finish_reason":null}]}

// 第 2 帧：剩下的半截占位符才姗姗来迟
data: {"id":"chatcmpl-s1","choices":[{"index":0,"delta":{"content":"I_PHONE_1}} 确认排期。"},"finish_reason":null}]}
```

如果网关只是机械地对每一行 `data:` 执行正则替换：
- 第 1 帧里的 `{{EC_PI` 匹配不上完整正则 `\{\{EC_PII_[A-Z0-9]+_\d+\}\}`，直接原样漏给客户端；
- 第 2 帧里的 `I_PHONE_1}}` 同样匹配不上，再次原样漏出。

最终呈现在用户界面或下游工具节点里的，就是一串毫无用处的乱码 `请立即联系号码：{{EC_PII_PHONE_1}} 确认排期`。更糟的是，如果下游接的是自动发短信或查库的 Function Calling 节点，这串未还原的占位符会直接引发参数校验报错，导致整条工作流中断。

| 流式脱敏还原方案 | 首字延迟 (TTFT) 影响 | 跨帧 Token 截断防御 | 多通道隔离 (`reasoning` / `tools`) | 内存占用边界 |
| :--- | :--- | :--- | :--- | :--- |
| 单帧逐行正则替换 | 0 ms（即收即转） | 完全失效（残片直接泄漏） | 无 | $O(1)$ |
| 全量缓冲后一次性还原 | 极差（退化为非流式，等待数秒至数十秒） | 有效 | 需整包解析 | $O(N)$（随响应长度线性膨胀） |
| 外层 HTTP 字节流滑动窗口 | 0 ms | 脆弱（易被 JSON 信封引号括号干扰） | 失效（多通道残片互相串台） | $O(1)$ |
| EdgeCat 帧级三通道滑动窗口 | 0 ms（安全前缀立即刷出） | 完备（含 `}}` 跨帧劈裂防御） | 完备（按 `choiceIdx` 与 `toolIdx` 独立缓冲） | 严格受控（单通道上限 64 Bytes） |

---

## 二、 第一次关键节点共创：为什么不能直接在外层字节流上挂滑动窗口？

在项目实施的第一个关键节点上，我最初的想法很直接：既然占位符跨帧断开了，那就在 HTTP 响应的 `io.Reader` 字节流外层套一个滑动窗口缓冲器，看到 `{{EC_` 先扣留，等到 `}}` 出现再替换刷出，岂不是连 JSON 解析都省了？

在与 AI 搭档推演底层工程边界时，AI 敏锐地指出了外层字节流方案的两个结构性死穴：

1. `JSON 信封字符污染候选区`：SSE 流并非裸文本流，它的每一帧都被包裹在 JSON 结构里。再看一眼上面第 1 帧的原始末尾字节：`...{"content":"请立即联系号码：{{EC_PI"},"finish_reason":null}]}`。在 `{{EC_PI` 后面，紧跟着的并不是第 2 帧的 `I_PHONE_1}}`，而是当前 JSON 帧的右引号、右花括号与字段名 `","finish_reason":null}]}`！外层字节流滑动窗口一旦读到双引号 `"` 和冒号 `:`，就会立即判定这不是合法的占位符（因为占位符只允许大写字母、数字和下划线），当场放弃缓冲，把半截 `{{EC_PI` 吐给客户端。
2. `多路并发增量通道串台`：现代推理接口早已不止一个 `delta.content` 字段。当接入 DeepSeek 等推理模型或执行并发工具调用时，同一个 `choice` 下会交错流淌着三条文本流：思考过程 `delta.reasoning_content`、正文 `delta.content`，以及多个并发工具参数 `delta.tool_calls[i].function.arguments`。如果共用外层字节缓冲，思考链末尾留下的半截括号，就会和下一帧正文或工具调用的字节混在一起。

想明白这层原理后，我们彻底否定了粗放的字节流拦截，在 `internal/proxy/sse_rehydrator.go` 中确立了帧级解析与按通道正交隔离的 `StreamRehydrator` 架构：
{% endraw %}

<p align="center">
  <img src="{{ '/assets/images/flowchart-edgecat-sse-sliding-window-rehydration.svg' | relative_url }}" alt="EdgeCat 帧级滑动窗口 SSE 还原与无损透传架构图" width="960" height="480" loading="lazy" decoding="async" />
</p>

{% raw %}
```go
type StreamRehydrator struct {
	vault                *filter.Vault
	contentRehydrators   map[int]*filter.SlidingRehydrator
	reasoningRehydrators map[int]*filter.SlidingRehydrator
	toolCallRehydrators  map[int]map[int]*filter.SlidingRehydrator
	lastID               string
	lastModel            string
}
```

每当上游吐出一行 `data: {...}`，网关先剥离 JSON 外壳，定位到具体的 `choiceIdx`：
- 正文增量送入专属的 `contentRehydrators[choiceIdx]`；
- 思维链增量送入专属的 `reasoningRehydrators[choiceIdx]`；
- 工具参数增量则按 `(choiceIdx, toolIdx)` 二维坐标送入独立的 `toolCallRehydrators[choiceIdx][toolIdx]`。

三条轨道在内存中物理隔离，各自维护独立的 `pending` 残片缓冲区，还原完成后再重新编码为合法的 SSE 帧并立即调用 `flusher.Flush()` 推向下游。

---

## 三、 双游标切分与“双右花括号 `}}` 劈裂”攻防战

有了帧级多通道隔离，最核心的算法落在了单通道内的 `SlidingRehydrator`（位于 `internal/filter/pii.go`）上。

它的职责非常明确：每收到一段增量文本 `chunk`，先与上一帧留下的 `r.pending` 拼成 `combined`，然后找出一个精准的切分游标 `cut`（$0 \le \text{cut} \le \text{len}(\text{combined})$）：
- 游标左侧 `combined[:cut]` 是确认安全的完整文本，立刻执行 `vault.Rehydrate` 并刷给客户端，保证零首字延迟损耗；
- 游标右侧 `combined[cut:]` 是疑似被截断的未闭合前缀，暂存回 `r.pending` 等待下一帧。

### 1. 怎么区分“被截断的占位符”和“模型正常输出的左花括号”？

这是编写 `findUnclosedPrefixCut` 时最容易翻车的地方。用户在让大模型写 Go、JavaScript 代码或输出 JSON 时，流式输出里到处都是 `{` 和 `{{`（比如 Vue/Jinja 模板语法）。如果一见到 `{` 就无脑扣留，直到攒够几千字才发现不是占位符，流式输出就会变成一卡一顿的幻灯片。

为此，我们在滑动窗口里设计了双重校验与 `MaxPendingLength = 64` 字节硬上限：

```go
func (r *SlidingRehydrator) findUnclosedPrefixCut(s string) int {
	// 仅扫描最后一个已闭合 "}}" 之后的尾部切片
	lastClose := strings.LastIndex(s, PlaceholderSuffix)
	searchStart := 0
	if lastClose != -1 {
		searchStart = lastClose + len(PlaceholderSuffix)
	}
	tail := s[searchStart:]
	if tail == "" {
		return len(s)
	}

	// 检查 1：尾部是否包含显式的未闭合 "{{EC_" 候选前缀？
	if idx := strings.Index(tail, "{{EC_"); idx != -1 {
		cand := tail[idx:]
		if len(cand) <= MaxPendingLength && isValidPlaceholderCandidate(cand) {
			return searchStart + idx
		}
	}

	// 检查 2：尾部是否恰好以 "{{EC_" 的更短前缀收尾？
	prefixes := []string{"{{EC", "{{E", "{{"}
	for _, pfx := range prefixes {
		if strings.HasSuffix(tail, pfx) {
			return len(s) - len(pfx)
		}
	}
	if strings.HasSuffix(tail, "{") {
		return len(s) - 1
	}

	return len(s)
}
```

当模型输出一段普通 JSON `{"status":` 时，第一帧末尾虽然有 `{`，但紧接着就是 `"status":`。由于它既不以 `{` 结尾，也不匹配 `{{EC_`，`findUnclosedPrefixCut` 直接返回 `len(s)`，零延迟放行。即使模型恶作剧式地输出 `{{EC_THIS_IS_A_SUPER_LONG_VARIABLE_NAME...`，一旦长度超过 64 字节上限或者遇到空格、引号等非标识符字符，缓冲器也会立刻解除扣留原样刷出，彻底封死内存膨胀漏洞。

### 2. 被劈开的双右花括号：`{{EC_PII_PHONE_1}` 与 `}`

就在我们以为这套状态机已经滴水不漏时，在第二轮红蓝对抗代码审查（对应提交 `84445d3`）中，我们抓出了一个极其隐蔽的边界漏洞。

当时的 `isValidPlaceholderCandidate` 逻辑是：去掉开头的 `{{EC_` 后，剩余字符必须全部属于 `[A-Za-z0-9_]`。

但如果分词器偏偏在最后两个右花括号 `}}` 中间劈了一刀呢？
- 第 1 帧吐出：`Phone: {{EC_PII_PHONE_1}`（注意末尾带了一个右花括号 `}`）；
- 第 2 帧吐出：`} is verified.`（吐出第二个右花括号 `}`）。

来看看旧版状态机在第 1 帧会发生什么惨剧：
1. `strings.LastIndex(s, "}}")` 找不到双右花括号，说明尚未闭合；
2. 提取候选串 `cand = "{{EC_PII_PHONE_1}"`；
3. 送入 `isValidPlaceholderCandidate` 检查：因为末尾那个落单的 `}` 不属于 `[A-Za-z0-9_]`，校验函数当场返回 `false`（误以为这是普通花括号文本）！
4. `findUnclosedPrefixCut` 返回 `len(s)`，把半截 `{{EC_PII_PHONE_1}` 直接刷给了客户端；等第 2 帧的 `}` 到达时，早已无法挽回。
{% endraw %}

![双花括号跨帧断裂与机械缓冲仓 哲思插图]({{ '/assets/images/illustration-edgecat-token-slicing-brace-trap.jpg' | relative_url }})

{% raw %}
定位到这个切口后，我们在 `internal/filter/pii.go` 第 307 行补上了极其克制的三行手术刀修补：

```go
func isValidPlaceholderCandidate(s string) bool {
	if !strings.HasPrefix(s, "{{EC_") {
		return false
	}
	body := s[len("{{EC_"):]
	// 允许末尾最多带一个 '}'，专门接住闭合双花括号 "}}" 被跨帧劈开的场景
	body = strings.TrimSuffix(body, PlaceholderSuffix[:1])
	if strings.Contains(body, "}") {
		return false
	}
	for _, ch := range body {
		if !((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_') {
			return false
		}
	}
	return true
}
```

通过 `strings.TrimSuffix(body, "}")`，状态机精确允许候选串的最末尾悬挂至多一个右花括号 `}`，而如果中间包含 `}` 则依然果断拒绝。随后我立刻在 `pii_test.go` 和 `review_fixes_test.go` 中补齐了 `TestProxy_Streaming_PII_SplitBetweenClosingBraces` 端到端回归测试，看着 `{{EC_PII_PHONE_1}` 与 `} is verified.` 在网关内无缝咬合并还原为 `13800138000 is verified.`，这处极易在生产环境偶发漏数据的暗礁终于被彻底拔除。

---

## 四、 尾帧消失之谜：为什么不能等到 `[DONE]` 才清空缓冲区？

解决了中间帧的切分，流结束时的收尾同样暗藏杀机。

假设模型在生成的最后一个词恰好是个左花括号 `{`，或者是一段未闭合的 `{{EC_FAKE` 文本。此时这段字符正被扣留在 `r.pending` 缓冲区里。网关该在什么时候把它吐出来？

直觉的做法是：等读到上游发来的 `data: [DONE]` 或流 EOF 时，调用 `FlushPendingChunks()` 构造一个合成的 SSE 增量帧（Synthetic Chunk）发给客户端。

但在实测主流 OpenAI SDK 与前端编排客户端时，我们发现了另一个反直觉的协议现实：
许多严格遵循 OpenAI 规范的客户端，在收到某个 `choice` 带有非空的 `"finish_reason": "stop"`（或 `"tool_calls"`）的那一帧时，就会认定该分支生成完毕并立即终止对该 choice 的读取！如果你把残留在 `pending` 里的尾巴留到 `finish_reason` 之后的合成帧里才发送，客户端根本不会拆包，导致最后几个字符永久丢失。

因此，我们在 `sse_rehydrator.go` 中设计了双保险尾帧排空机制：

1. `第一道防线（finish_reason 原地追加）`：在同一帧处理完 `content`、`reasoning_content` 和 `tool_calls` 后，立即检查当前帧的 `choice["finish_reason"] != nil`。一旦发现结束信标，当场调用该通道的 `r.Flush()`，将残留文本直接原地拼接到当前结束帧的 `delta` 字段中随帧发出，并销毁该 `choiceIdx` 的缓冲器实例；
2. `第二道防线（[DONE] 前合成帧兜底）`：万一上游本地模型因为超时或异常中断，根本没发 `finish_reason` 就直接断开连接或发了 `[DONE]`，网关外层循环会在退出前调用 `FlushPendingChunks()`，利用记录的 `lastID` 与 `lastModel` 合成标准 `chat.completion.chunk` 事件补发，确保在任何异常拓扑下都不吞噬一个字节。

---

## 五、 协议无损透传：为什么我们禁止用 Go Struct 反序列化请求？

流式脱敏还原要想在真实生产环境跑通，还必须跨过最后一道工程坎：怎么在不破坏现代大模型复杂协议字段的前提下修改 JSON？

很多用 Go 编写的早期网关，喜欢定义一个强类型的结构体：

```go
// 典型的反模式：用定型结构体反序列化请求
type ChatRequest struct {
    Model    string    `json:"model"`
    Messages []Message `json:"messages"`
    Stream   bool      `json:"stream"`
}
```

这种写法在三年前或许可行，但在今天的 Agent 工程中是一场灾难：
- 客户端发来的 `tools`、`tool_choice`、`parallel_tool_calls`、`reasoning_effort`、`seed` 以及各家模型私有的扩展参数，只要结构体里没定义，在 `json.Unmarshal` 再 `json.Marshal` 之后就会被静默丢弃，直接废掉所有工具调用能力；
- Go 标准库的 `encoding/json` 在解析 `any` 接口时，默认会把所有整数（如 `created: 1729590000` 或大整数 `seed`）转成 `float64`，重编码时极易发生精度丢失或变成科学计数法；
- `json.Encoder` 默认开启了 `escapeHTML`，会把提示词或代码里的 `<`、`>`、`&` 全部转义成 `\u003c`、`\u003e`，不仅无端膨胀 Token 字节，还会破坏下游的精确字节签名；
- 更隐蔽的是模型路由降级 Bug：如果网关在尝试请求本地 Ollama 时，把结构体里的 `Model` 字段从客户端请求的 `"gpt-4o-mini"` 原地改写成了本地物理模型名 `"qwen2.5:7b"`；一旦本地 3.5 秒首字看门狗超时触发云端降级，网关拿着被改写后的 `"qwen2.5:7b"` 去查云端路由表，就会在回退时发生映射错乱。

为了根治这一系列次生灾害，EdgeCat 在 `internal/proxy/protocol.go` 中确立了 **协议无损透传（Lossless Wire Passthrough）** 准则：

1. `冻结逻辑模型名与 map[string]any 原位持有`：`ParseRequest` 在解码时保留一份不可变的 `logicalModel` 供降级路由随时回溯，底层负载直接保存在 `map[string]any` 中，网关不认识的字段 100% 原样穿透；
2. `强制 json.Number 与禁用 HTML 转义`：解码器统一挂载 `dec.UseNumber()`，编码器统一挂载 `enc.SetEscapeHTML(false)` 并剥离尾部多余换行符，确保数值字面量与代码符号原封不动；
3. `多模态与工具调用的手术刀式脱敏`：`MaskRequestContent` 递归识别 `messages[].content` 的形态：如果是普通字符串则直接掩码；如果是多模态数组（包含文本与 Base64 图片/音频），则精准只对 `type == "text"` 的分块执行正则脱敏，图片负载零拷贝放行；同时深入 `tool_calls[].function.arguments` 字符串内部拦截敏感参数，堵住 Agent 调工具外泄隐私的后门；
4. `掩码顺序防子串碰撞`：在 `MaskText` 中严格按 `APIKey ➔ Email ➔ IPv4 ➔ Phone` 的固定优先级顺序执行替换，防止长 API Key 中恰好包含连续 11 位数字被手机正则提前截胡切碎。

---

## 六、 工程代价与适用边界

没有任何架构设计是免费的午餐。在将 EdgeCat 部署为本地工作站 Sidecar 与家庭 NAS 网关的过程中，这套帧级滑动窗口与无损透传方案也有其明确的工程代价与能力边界：

1. `帧级 JSON 解码与重编码的 CPU 开销`：为了隔离 `content`、`reasoning_content` 与 `tool_calls` 三条通道并剥离 JSON 信封干扰，当请求命中了至少 1 处 PII 脱敏（`vault.RedactedCount() > 0`）时，网关必须对每一个 SSE 帧执行 `json.Decoder` 解析与 `marshalObject` 重编码。虽然我们在 `vault.RedactedCount() == 0` 时做了零开销短路直通（Fast-Path Bypass），但在重度脱敏流中，单帧会有数微秒的额外序列化开销。由于大模型吐字速率通常在每秒几十到上百 Token，这点微秒级 CPU 消耗在个人工作站与 NAS 上完全可以忽略，但它不适合直接照搬到每秒百万帧的超大规模公有云核心交换网关；
2. `尾部单字符短暂驻留延迟`：当模型在正文中正常输出一个左花括号 `{` 且恰好位于某个 SSE 帧的最末尾时，滑动窗口为了确认下一帧是否会拼成 `{{EC_`，会将这一个 `{` 字符扣留到下一帧到达（通常间隔 10~30ms）才释放。这不会影响整句的首字时间（TTFT），但在极端慢速网络下，该单字符会有一次帧间微延迟；
3. `64 字节窗口上限与模式匹配的固有边界`：`MaxPendingLength = 64` 足以容纳 EdgeCat 生成的所有标准占位符（如 `{{EC_PII_APIKEY_12}}` 仅 20 字节）。但正则掩码本质上只能拦截具有固定结构特征的敏感词（如兼容 `+86` 与空格横杠分隔的手机号、标准邮箱、RFC1918 私网 IPv4、主流前缀密钥）。如果用户在提示词中用自然语言写下“我的密码是小明的生日加三个八”，正则引擎无法理解语义，这类非结构化隐私依然应当通过路由策略强制锁死在本地 Ollama 算力层（设置 `daily_cloud_limit: -1` 禁止云端降级），从物理流向上杜绝出网。

---

## 七、 结语

回看 EdgeCat 这几百行流式还原代码的演进，从最初设想的“正则一把梭”，到发现跨帧 Token 切片，再到踩中 JSON 信封污染、多通道串台、双花括号 `}}` 从中间劈裂以及 `finish_reason` 提前断流，每一个细节都在提醒我们：

把大模型的概率性字节流接入严肃的软件工程体系，靠的从来不是宏大的架构口号，而是对协议帧边界、状态机不变量和极端分词切口的一次次死磕。

当客户端里的光标丝滑地跳动，当被隐去真身的手机号跨越公网大模型算力又毫发无损地回到本地 **AI 工作流编排** 画布上时，那些藏在 64 字节滑动窗口里的守卫逻辑，才真正完成了它的使命。

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
