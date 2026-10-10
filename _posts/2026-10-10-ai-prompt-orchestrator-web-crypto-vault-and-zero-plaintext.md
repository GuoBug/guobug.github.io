---
layout: post
title: "PatchCat 工程复盘：用 Web Crypto API 加密本地 API Key（开源系列 23）"
title_en: "PatchCat Engineering Notes: Encrypting Local API Keys with Web Crypto API"
date: 2026-10-10 10:00:00 +0800
categories: [AI, Architecture, Engineering]
pub_tag: "Web Crypto & Local-First Security"
math: true
read_time: "16 MIN READ"
summary: "PatchCat 是一个运行在浏览器中的 AI 工作流编排工具。此前，服务商 API Key 会随配置保存在 LocalStorage 中。本文记录这次本地存储改造：使用 PBKDF2 和 AES-256-GCM 加密凭据，将密文存入 IndexedDB，并通过白盒审查修复旧数据迁移、页面卸载和口令轮换中的问题。同时讨论浏览器端加密的实际防护范围，以及它无法解决的安全风险。"
summary_en: "PatchCat is a browser-based AI workflow orchestrator. This article documents the migration from plaintext API key storage to client-side encryption with PBKDF2, AES-256-GCM, and IndexedDB. It also covers issues found during code review, including legacy migration, page lifecycle handling, and atomic password rotation, along with the security limits of browser-side encryption."
tags: [AI Workflow Orchestration, Web Crypto API, AES-256-GCM, IndexedDB, PBKDF2, Local-First, PatchCat]
series: "PatchCat · AI Prompt Flow Orchestrator"
---

> 项目开源地址：[GitHub - PatchCat](https://github.com/GuoBug/PatchCat)
>
> 在线体验：[PatchCat](https://guobug.github.io/PatchCat/)
>
> 往期回顾：
>
> 📖 [开源系列 22：纯前端实现 BM25 倒排索引与 RRF 排名融合]({{ '/posts/2026/10/06/ai-prompt-orchestrator-zero-dependency-bm25-and-rrf/' | relative_url }})
>
> 📖 [开源系列 21：Flow Preflight 语法静态分析与画布连线检查]({{ '/posts/2026/10/03/ai-prompt-orchestrator-flow-preflight-lint-and-simulation/' | relative_url }})
>
> 📖 [开源系列 20：模型级联路由与失败回退]({{ '/posts/2026/10/02/ai-prompt-orchestrator-cheap-first-model-routing-and-cascade-fallback/' | relative_url }})
>
> 📖 [开源系列 19：Agent 重复调用检测与熔断]({{ '/posts/2026/10/01/ai-prompt-orchestrator-agent-deadlock-and-circuit-breaker/' | relative_url }})
>
> 📖 [开源系列 18：DAG 检查点与断点续跑]({{ '/posts/2026/09/30/ai-prompt-orchestrator-dag-checkpoint-and-reverse-bfs/' | relative_url }})
>
> 📖 [开源系列 17：上下文窗口裁剪与原子更新]({{ '/posts/2026/09/29/ai-prompt-orchestrator-context-engineering-dual-anchor-pruning/' | relative_url }})
>
> 📖 [开源系列 16：架构清理与统计检验]({{ '/posts/2026/09/26/ai-prompt-orchestrator-architectural-purity-and-mcnemar-eval/' | relative_url }})

---

做浏览器端 AI 工具时，有一个问题很容易被放到后面处理：用户填写的 API Key，到底存在哪里？

PatchCat 采用 Local-First 设计，希望用户打开网页就能配置模型、编排工作流，不必先部署后端服务。因此，最初把服务商配置保存在 LocalStorage，是一种很直接的实现方式。

问题也出在这里。为了让用户刷新页面后不必重新填写密钥，应用会把 API Key 一起写入本地存储。它确实方便，但也意味着密钥可能以明文形式留在浏览器的持久化数据中。

这次改造的目标很明确：**保留纯前端使用方式，同时不再将 API Key 明文持久化到 LocalStorage。**

最终方案使用浏览器原生 Web Crypto API 完成密钥派生与加密，将加密后的凭据保存到 IndexedDB，并增加主口令解锁、旧数据迁移和异常处理逻辑。

真正花时间的并不只是加密算法。完成第一版后，我们还发现了几个容易被忽略的问题：升级时可能丢失旧密钥，用户取消离开页面的操作可能导致会话提前锁定，修改主口令时两份密文也可能出现状态不一致。

这篇文章记录这次改造的实现思路，以及代码审查中发现的问题。

![PatchCat Web Crypto Vault Cover Impasto]({{ '/assets/images/cover-patchcat-crypto-vault.jpg' | relative_url }})

## 一、为什么要改本地密钥存储

PatchCat 支持 BYOK（Bring Your Own Key），用户可以配置自己使用的模型服务商及其 API Key。

这种方式不需要应用替用户托管密钥，也不必额外维护一个专门的凭据服务。对于强调本地运行和低部署成本的工具来说，它很合适。

但如果直接把整个配置对象序列化到 LocalStorage，代码通常会变成这样：

```typescript
localStorage.setItem(
  'settings',
  JSON.stringify({ apiKey })
);
```

实现很简单，安全边界却比较模糊。

首先，浏览器开发者工具可以直接查看 LocalStorage 中的数据。其次，拥有相应权限的浏览器扩展可能读取网站存储；如果页面存在 XSS 漏洞，注入的脚本也可能访问应用能够读取的数据。

需要说明的是，并不是所有浏览器扩展都能随意访问所有网站的数据，具体取决于扩展权限和浏览器的权限机制。但只要 API Key 以明文形式持久化，具备相应访问能力的代码就有机会拿到它。

这对 AI 工具尤其值得注意。API Key 往往关联着实际的模型调用权限，有些服务还会按照使用量计费。密钥泄露后，影响不只是个人配置丢失，还可能产生未经授权的调用和费用。

另一种做法是增加后端代理或密钥管理服务，但这会引入部署、运维和服务端安全等额外成本，也改变了 PatchCat 原本的使用方式。

因此，这次没有增加后端，而是先利用浏览器已经提供的密码学接口解决静态存储问题。

这里的目标不是让浏览器变成绝对安全的保险箱，而是减少密钥在本地持久化时暴露的机会。

## 二、先明确需要满足的约束

在开始修改存储层之前，需要先明确哪些行为不能改变。

这次改造主要有三个要求。

**第一，继续保持纯前端运行。**

加密、解密、口令验证和凭据存储都在浏览器中完成，不新增 Node.js、Python 或其他后端服务。

**第二，持久化数据中不再出现明文 API Key。**

LocalStorage 只保存非敏感配置。需要长期保存的 API Key 经加密后写入 IndexedDB。

这里的约束针对应用自身的持久化逻辑，并不意味着浏览器内存、网络请求或其他组件中永远不会出现明文密钥。

**第三，导出工作流时不能顺带导出个人凭据。**

用户分享的是工作流结构，而不是自己的 API Key、私有配置或本地文件路径。因此，导出逻辑也需要明确哪些字段可以保留，哪些字段必须剥离。

在此基础上，我们选择了几项具体实现：

- 使用 PBKDF2 从主口令派生加密密钥。
- 使用 AES-256-GCM 加密凭据，并验证密文完整性。
- 将口令验证数据与业务凭据分开保存。
- 将加密数据放到独立的 IndexedDB 存储中。
- 在会话锁定时清理应用持有的敏感运行时状态。

![PatchCat Web Crypto Vault Architecture SVG]({{ '/assets/images/flowchart-web-crypto-vault-architecture.svg' | relative_url }})

## 三、加密实现：PBKDF2 与 AES-256-GCM

### 1. 从主口令派生加密密钥

用户需要记住的是主口令，而不是一串随机生成的 AES 密钥。

但主口令通常是文本，不能直接当作 AES-256 密钥使用。因此，需要先通过密钥派生函数将口令转换成适合加密操作的密钥。

PatchCat 使用 PBKDF2、SHA-256 和随机盐值：

\[
K = \operatorname{PBKDF2}
(P, S, 600000, \operatorname{SHA256})
\]

其中：

- \(P\) 是用户输入的主口令。
- \(S\) 是随机生成的盐值。
- 600000 是迭代次数。
- \(K\) 是派生出的 256 位密钥。

每次初始化加密数据时，系统会生成 16 字节随机盐值。解锁时，使用相同口令和盐值重新派生密钥。

盐值不需要保密，它的作用是让相同口令在不同盐值下产生不同的派生结果，增加预计算攻击的成本。

600,000 次 PBKDF2-HMAC-SHA-256 迭代，是 OWASP 针对该算法给出的密码存储建议之一。这里借鉴的是它的迭代参数，而不是将浏览器端密钥加密等同于服务端密码存储。

具体耗时与设备性能、浏览器实现等因素有关，因此不应把某个固定的毫秒数当成所有设备都适用的基准。实际产品还需要在目标设备上测量解锁耗时。

在 Web Crypto API 中，派生出的密钥可以作为不可导出的 `CryptoKey` 使用：

```typescript
const key = await crypto.subtle.deriveKey(
  {
    name: 'PBKDF2',
    salt,
    iterations: 600_000,
    hash: 'SHA-256',
  },
  passwordKey,
  {
    name: 'AES-GCM',
    length: 256,
  },
  false,
  ['encrypt', 'decrypt']
);
```

这里的 `false` 对应 `extractable: false`，表示不能通过标准密钥导出接口直接导出该密钥的原始字节。

不过，这并不意味着密钥对应用中的恶意 JavaScript 不可用。如果攻击者已经能够在页面中执行任意脚本，仍可能利用应用的加密或解密能力。因此，不可导出只是缩小密钥暴露面的措施之一，并不是对抗 XSS 的完整方案。

### 2. 使用 AES-GCM 加密凭据

密钥派生完成后，实际的 API Key 由 AES-256-GCM 加密。

选择 GCM 的原因是，它不仅能够加密数据，还能验证密文的完整性。解密时，如果密文、初始化向量或认证标签不匹配，密码学接口就会拒绝返回解密结果。

相比只提供机密性的加密模式，这种认证加密更适合保存需要防止意外篡改的凭据。

每次加密都需要使用新的随机初始化向量（IV）。对于 AES-GCM，同一密钥下重复使用 IV 会造成严重的安全问题，因此不能把固定 IV 写死在代码中，也不能在多次加密之间复用。

PatchCat 的加密载荷采用以下结构：

```typescript
export interface EncryptedVaultPayload {
  version: 1;
  saltHex: string;
  ivHex: string;
  ciphertextHex: string;
  authTagLength: 128;
}
```

字段含义如下：

| 字段 | 作用 |
| --- | --- |
| `version` | 标识载荷格式版本，便于后续升级 |
| `saltHex` | 保存密钥派生所需的盐值 |
| `ivHex` | 保存 AES-GCM 使用的初始化向量 |
| `ciphertextHex` | 保存密文及认证标签 |
| `authTagLength` | 标识 128 位认证标签长度 |

这里需要区分两件事：认证标签能够帮助检测密文是否被篡改，但不能阻止攻击者删除、替换或回滚整个存储记录。数据完整性验证也不等于存储可用性保障。

### 3. 为什么将口令验证与凭据分开

仅有加密密文，还需要一种方式判断用户输入的主口令是否正确。

PatchCat 将本地加密数据拆成两个逻辑载荷：

- **Canary 校验数据**：加密固定的校验字符串，用来验证主口令。
- **Secrets 凭据数据**：保存加密后的服务商 API Key 映射。

Canary 的校验字符串为：

```text
PATCHCAT_VAULT_CANARY_OK_v1
```

解锁时，系统先尝试解密 Canary，再检查解密结果是否与预期值一致。验证通过后，才继续读取和解密业务凭据。

这样可以把口令验证与业务数据加载分开处理，也能让错误口令的反馈更明确。

但 Canary 不是第二把密钥，也不是额外的加密屏障。它的主要作用是验证口令是否正确，不能独立抵御离线口令猜测。

如果两份载荷分别加密，必须确保它们的密钥派生参数、盐值和密文版本都得到正确管理。载荷分离本身不会自动带来更强的密码学安全性。

## 四、调整存储层：让明文 API Key 不再持久化

加密功能完成后，接下来要处理的是原有状态管理逻辑。

此前，PatchCat 会把服务商配置写入 LocalStorage。问题在于，配置对象不仅包含接口地址、模型名称，还包含 API Key。

如果只在 UI 上隐藏密钥输入框，却继续序列化整个对象，明文依然会进入持久化数据。因此，这次改造需要从存储入口处理，而不是只调整界面。

新的存储分工如下：

```text
                 Zustand In-Memory State
                 ┌─────────────────────┐
                 │ 活动会话所需的配置   │
                 │ apiKey：运行时使用   │
                 └──────────┬──────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
       LocalStorage                IndexedDB
       ┌────────────────┐     ┌──────────────────┐
       │ 非敏感配置      │     │ 加密后的凭据     │
       │ baseUrl         │     │ AES-GCM 密文     │
       │ model           │     │ 盐值、IV 等元数据│
       │ 不保存 apiKey    │     │ 不保存明文 API Key│
       └────────────────┘     └──────────────────┘
```

LocalStorage 继续承担普通配置的持久化职责，IndexedDB 则负责保存加密后的凭据。

在 `saveState()` 中，系统只提取允许持久化的字段：

```typescript
const sanitizedProviders: Record<
  string,
  Partial<ProviderConfig>
> = {};

for (const [id, provider] of Object.entries(state.providers)) {
  const { apiKey: _omittedKey, ...safeConfig } = provider;

  sanitizedProviders[id] = safeConfig;
}
```

这段代码展示了基本的字段剥离逻辑。实际实现还需要确保其他持久化入口、状态迁移逻辑和导出功能遵循相同规则，不能只依赖单个 `saveState()` 方法。

完成改造后，LocalStorage 中的服务商配置不再包含明文 API Key。

需要注意，浏览器的 LocalStorage 和 IndexedDB 都属于客户端存储。将数据从一个存储区域移到另一个区域，并不会自动赋予它安全性。真正起作用的是：敏感数据在写入 IndexedDB 之前已经完成加密，应用不会把解密后的内容再次作为明文持久化。

## 五、代码审查发现的四个问题

加密算法本身并不是这次改造中最棘手的部分。更麻烦的是，新存储机制改变了原有数据的生命周期。

旧版本默认认为配置写入 LocalStorage 后就能长期存在；新版本则要求密钥在内存、加密存储和主口令之间完成转换。任何一步处理不当，都可能导致用户丢失凭据，或者出现界面状态与实际存储不一致的问题。

完成第一版后，我们进行了两轮白盒代码审查，重点检查迁移、页面生命周期和事务处理。

![PatchCat Vault Audit Remediation Intext Impasto]({{ '/assets/images/intext-vault-audit-remediation.jpg' | relative_url }})

### 1. 旧版本升级时，密钥可能丢失

旧版本已经保存在 LocalStorage 中的 API Key，需要在升级后迁移到新的加密存储。

第一版实现的流程比较直接：

1. 读取旧配置中的明文 API Key。
2. 将密钥载入内存。
3. 清理旧存储中的明文数据。
4. 等待用户设置主口令，再将密钥加密保存。

问题出现在第三步与第四步之间。

假设用户打开升级后的页面，旧密钥已经从 LocalStorage 中删除，但用户还没有设置主口令。如果此时刷新页面或意外关闭标签页，尚未加密保存的密钥就可能随内存状态一起丢失。

这不是加密算法的问题，而是迁移过程缺少可靠的中间状态。

修复时，我们在 `src/App.tsx` 中增加了明显的迁移提示，并使用 `sessionStorage` 保存仅限当前标签页的临时迁移数据。

这样，即使用户误刷新页面，应用也有机会恢复尚未完成加密的凭据。加密保存成功后，再清理临时数据。

这项改动需要特别注意执行顺序：只有确认临时数据已成功保存、恢复路径有效后，才能清理旧数据；同样，只有确认加密载荷已经成功写入，才能删除临时副本。

`sessionStorage` 只是过渡措施，并不等同于可靠备份。浏览器会话结束、存储被清理或设备异常时，数据仍可能丢失。因此，迁移流程应明确告知用户当前状态，并避免在迁移未完成时静默清理所有可恢复数据。

### 2. 新用户可能误以为密钥已经保存

取消明文持久化后，还出现了另一个问题。

新用户首次打开 PatchCat，在服务商设置中填写 API Key。如果此时尚未设置主口令，密钥只能暂存在运行时状态中。

用户填写完成后离开页面，再次打开时发现密钥不见了，就会认为应用没有正常保存配置。

从系统设计角度看，这符合新的存储规则；从用户体验角度看，却是一个容易引起误解的行为。

因此，我们在密钥输入框下方增加了状态提示，让用户知道当前凭据处于什么状态：

- **尚未设置主口令**：明确说明密钥暂时保存在当前会话中，尚未完成持久化。
- **暗室已锁定**：提示用户解锁后才能访问和修改已加密的凭据。
- **暗室已解锁**：提示用户当前凭据可以通过加密流程保存。

这里最重要的不是黄色、灰色或绿色的视觉设计，而是不能让用户把“输入框中有内容”误认为“数据已经安全保存”。

如果加密或持久化失败，界面也应该给出明确反馈，而不是仅根据暗室的解锁状态就显示保存成功。

### 3. 取消离开页面后，暗室却已经锁定

为了减少敏感数据在内存中的驻留时间，第一版代码在 `beforeunload` 事件中直接调用了 `lockVault()`。

但 `beforeunload` 并不意味着页面一定会被关闭。

例如，用户正在运行工作流，浏览器准备离开页面时弹出确认提示。用户选择取消后，页面仍然继续运行。

如果暗室已经在 `beforeunload` 中提前锁定，当前工作流就可能失去访问 API Key 所需的运行时状态，导致后续模型调用失败。

修复后，我们将离开页面的检查与会话清理分开处理：

- `beforeunload` 用于处理离开页面前的必要检查。
- `pagehide` 用于处理页面进入隐藏、离开或被浏览器放入往返缓存等生命周期变化。
- 会话锁定和凭据清理逻辑需要考虑页面是否可能恢复，而不是把某个生命周期事件简单等同于永久销毁。

这里还有一个容易忽略的细节：`pagehide` 也不代表文档一定会被彻底销毁。浏览器可能将页面放入 Back-Forward Cache（往返缓存），之后再恢复页面。

因此，不能仅靠将清理逻辑从 `beforeunload` 移到 `pagehide`，就宣称已经解决所有生命周期问题。实际实现还需要结合 `pageshow`、页面恢复状态和应用的会话策略进行验证。

这次审查也让我们重新检查了工作流执行期间的密钥生命周期：锁定操作不仅要清理凭据，还要确保正在执行的任务能够正确处理会话失效，不能留下无响应的节点或不明确的执行状态。

### 4. 修改主口令时，两份密文可能不一致

用户修改主口令时，需要先使用旧口令解密现有数据，再用新口令重新加密 Canary 和 Secrets。

第一版实现分别写入这两份载荷：

```typescript
await saveCanary(newCanary);
await saveEncryptedSecrets(newSecrets);
```

如果第一次写入成功，第二次写入失败，就可能出现 Canary 已经使用新口令加密，而业务凭据仍使用旧口令加密的情况。

下一次解锁时，用户输入新口令能够通过 Canary 验证，却无法解密业务凭据。

反过来，如果先更新业务凭据，也会出现类似的不一致。

解决方法是将两份数据放进同一个 IndexedDB 读写事务中提交：

```typescript
await saveEncryptedSecretsBatch({
  canary: newCanary,
  secrets: newSecrets,
});
```

上面是批量保存接口的调用示意。关键在于底层实现必须使用同一个读写事务，并在任一写入失败时正确中止事务。

只有这样，才能保证两份载荷一起提交，或者一起回滚。

这里需要区分数据库事务原子性与完整的口令轮换流程：事务可以保证存储更新不会只成功一半，但仍需要处理加密失败、事务中止、页面关闭以及旧状态恢复等情况。不能在数据库提交完成前，就把应用内存中的口令状态视为已经永久更新。

这次修复最终落到了存储适配层，而不是让 UI 依次调用两个独立的保存接口。

## 六、性能与安全边界

本地加密减少了明文持久化带来的风险，但也增加了计算开销和状态管理的复杂度。

### 1. 解锁需要额外计算

PBKDF2 的主要成本是迭代计算。600,000 次 SHA-256 迭代会带来一定延迟，具体时间取决于设备和浏览器。

由于 Web Crypto API 提供异步接口，密钥派生可以通过 Promise 完成，不需要同步阻塞整个调用流程。不过，界面仍然需要展示加载状态，并防止用户连续点击解锁按钮导致重复操作。

如果后续要优化体验，应该先测量实际设备上的派生耗时，再决定是否调整参数，而不是为了追求解锁速度就随意降低迭代次数。

### 2. 忘记主口令后，无法通过服务器找回

PatchCat 不托管用户的主口令，也没有保存可以用于恢复本地加密密钥的服务端秘密。

如果用户忘记主口令，而本地没有其他可用的备份或恢复机制，应用就无法正常解密已有凭据。

重置暗室可以让用户重新配置 API Key，但不能自动恢复原来的加密数据。

这也是 Local-First 方案需要明确告知用户的取舍：减少对服务器的依赖，同时意味着开发者无法像传统账号系统那样直接执行密码重置并恢复数据。

### 3. 本地加密无法解决所有浏览器攻击

这套方案主要针对的是 API Key 明文持久化的问题。

它可以减少以下风险：

- 其他程序直接从 LocalStorage 读取明文 API Key。
- 本地持久化数据被意外查看时直接暴露有效凭据。
- 导出工作流时意外携带 API Key。

但它不能解决所有攻击场景。

**如果攻击者能够在页面中执行恶意 JavaScript，本地加密仍可能失效。**

例如，XSS 攻击可能读取用户输入的主口令、调用应用的解密流程，或者在密钥解锁后获取正在使用的凭据。

同样，拥有足够权限的恶意浏览器扩展也可能通过页面交互、脚本注入或其他途径窃取解密后的数据。把密钥存进 IndexedDB，并不意味着扩展就无法再接触它。

因此，这项改造不能替代 XSS 防护、依赖安全检查、严格的内容安全策略（CSP）以及对第三方脚本的管理。

它解决的是一个具体问题：不再把可直接使用的 API Key 明文长期保存在浏览器的普通持久化存储中。

对于 Local-First 应用，这是一项有价值的改进，但不能把它描述成完整的端侧安全体系。

## 七、测试结果与后续工作

完成存储改造和问题修复后，我们为相关行为补充了测试，覆盖口令验证、加密存储、明文剥离和异常处理等场景。

截至本次改造记录，PatchCat 的全工程测试套件共包含 514 项测试，全部通过。

需要说明的是，测试全部通过只能说明已覆盖的测试场景符合预期，并不等于所有安全风险都已经消除。对于加密存储，除了正常解锁流程，还应持续验证错误口令、损坏载荷、事务中断、旧版本迁移失败和页面恢复等边界情况。

这次改造也改变了我们看待本地存储的方式。

以前，配置持久化更像是一个普通的状态管理问题：把数据保存下来，下次启动再读取即可。

引入加密之后，数据的创建、保存、恢复、迁移和销毁必须放在同一个生命周期里考虑。否则，即使加密算法选对了，仍然可能因为状态转换顺序错误而丢失数据，或者让用户在不知情的情况下进入无法解锁的状态。

对于 PatchCat 来说，这次工作的重点不只是接入 Web Crypto API，而是把 API Key 的存储规则落实到应用的各个环节：普通配置与敏感数据分开保存，持久化前执行字段过滤，口令轮换使用原子事务，页面生命周期变化则需要有明确的会话处理策略。

这也为后续继续完善工作流引擎提供了基础。DAG 调度、模型路由和断点续跑关注的是任务状态能否被正确管理；凭据加密则关注运行这些任务所需的敏感数据能否得到合理保护。两者解决的是不同的问题，但都需要认真处理状态转换和异常路径。

---

> 下一篇预告
>
> 📖 《从 0 到 1 打造 AI 提示流编排器：Cross-Encoder 交叉重排 API 统一适配与位次跃迁遥测实战（开源系列 24）》

---

> **关于作者**
>
> **郭强（GuoBug）**，Product Engineer，做平台工程，也做业务增长。目前主要关注 AI 工作流编排、DAG 状态机与确定性系统架构。
>
> 开源项目：[GitHub](https://github.com/GuoBug) · [个人主页](https://guobug.github.io)
>
> 欢迎交流工作流引擎架构、拓扑调度和低门槛开发体验。
