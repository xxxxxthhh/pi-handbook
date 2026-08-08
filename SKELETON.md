# SKELETON · Pi 源码解读手册规格

锚定 `earendil-works/pi` @ `ac4ac9e` (2026-08-07)。本文件是章节清单与体例的唯一真值来源；`index.html` 的目录由它派生。

---

## 1. 读者与成功标准

**读者**：正在造或正在评估 agent harness 的工程师。已知道 agent 是「LLM + 工具 + 循环」，想知道把它做成生产软件时，真实的取舍长什么样。

**成功标准**（三条，可证伪）：

1. 读完 Part 2，能画出 pi 的一次 run 从 `prompt()` 到 `agent_end` 的完整状态流，并说出 steering 与 follow-up 的区别在循环的哪一层。
2. 读完 ch08，能准确回答「pi 现在是不是 durable 的」——并知道这个问题的答案在代码里的哪一行。
3. 读完 Part 5，能对自己项目的三个决定（要不要做权限系统、依赖怎么锁、issue 怎么收）给出有理由的选择。

**明确不覆盖**：pi 的使用教程（上游 `docs/quickstart.md` 已足够）、逐个 provider 的接入细节、TUI 的完整 API、如何写一个扩展的 step-by-step。

---

## 2. 视觉体系

从 `leetcode-handbook/assets/handbook.css` 移植，dark 默认。语义色重映射：

| 变量 | 原书含义 | 本书含义 |
|---|---|---|
| `--accent` 蓝 | 必会 / 骨架 | **已发布**：代码在跑，可信 |
| `--warn` 橙 | 变体 / 翻车点 | **部分落地 / 漂移 / 风险**：需要读者自己核 |
| `--mute` 灰 | 认脸级 | **仅设计文档**：只存在于 markdown |
| `--ok` 绿 | 正确答案 | 同左（quiz） |

signature 母题从「单调栈柱状图」改为**分层条带**（三层高度对应 ai / agent / coding-agent 三层抽象）。

---

## 3. 页面清单

```
index.html              目录页
chapters/ch00.html      导读
chapters/ch01..ch20     正文 21 章
glossary.html           术语表（英文术语 → 中文解释 → 首次出现章节）
drift.html              文档与代码漂移记录（本书原创，非复述）
sources.html            溯源索引：全站每条 path:line@SHA 的汇总表
assets/handbook.css     样式
assets/theme.js         主题切换
assets/quiz.js          自测组件
data/stats.json         程序化统计（tools/stats.sh 生成）
data/status.json        每章实现状态判定证据
tools/stats.sh              统计脚本
tools/gen-aux.mjs           生成 index / sources / drift
tools/gen-glossary.mjs      生成 glossary
tools/check-citations.mjs   GATE 1–4
tools/check-literals.mjs    GATE 5：「原文」块逐字核对
tools/mutate-test.sh        对全部门禁的 mutation test
tools/build.sh              完整构建流水线
```

---

## 4. 章节清单

每行格式：`编号 标题 — 一句话 [实现状态] [篇幅]`
篇幅：`S`≈1200字 / `M`≈2200字 / `L`≈3500字

### 导读

| # | 标题 | 一句话 | 状态 | 篇幅 |
|---|---|---|---|---|
| 00 | 导读 | 怎么读这本书、实现状态标记体系、锚定版本、不覆盖什么 | — | S |

### Part 1 · 全景（薄，最易沦为 README 复述，克制）

| # | 标题 | 一句话 | 状态 | 篇幅 |
|---|---|---|---|---|
| 01 | 仓库全景 | 10 个包的职责与依赖方向；一年 5565 commits 的形状告诉你什么 | 已发布 | M |
| 02 | 三层边界 | `pi-ai` / `pi-agent-core` / `pi-coding-agent` 各自守什么，什么被刻意留在上层 | 已发布 | M |

### Part 2 · 内核（厚，本书主体）

| # | 标题 | 一句话 | 状态 | 篇幅 |
|---|---|---|---|---|
| 03 | agent loop 逐行 ★样章 | 双层循环：内层收工具，外层等 follow-up；steering 插在哪一帧 | 已发布 | L |
| 04 | 工具执行 | 并行/串行的真实语义、preflight、`terminate`、截断消息的全批次作废 | 已发布 | L |
| 05 | 上下文管道 | `AgentMessage` ↔ LLM `Message` 的两道闸：`transformContext` 与 `convertToLlm` | 已发布 | M |
| 06 | 压缩 | 何时触发、切在哪、branch summarization、以及压缩本身要花的那次调用 | 已发布 | M |
| 07 | 会话持久化 | JSONL 追加日志、SQLite 后端、会话树与 fork/navigate | 已发布 | L |
| 08 | Harness v2 | **一份正在被消费的设计文档**：3437 行 spec、22 个抛 `HarnessNotImplemented` 的方法、reserve 协议 | 部分落地 | L |

### Part 3 · Provider（薄）

| # | 标题 | 一句话 | 状态 | 篇幅 |
|---|---|---|---|---|
| 09 | pi-ai 的抽象 | 统一多家 provider 的代价；`models.generated.ts` 为什么必须是生成的 | 已发布 | M |
| 10 | 认证与账号 | API key / OAuth / 订阅账号三条路，以及 token 过期为什么要 `getApiKey` 回调 | 已发布 | S |

### Part 4 · 界面与扩展（中）

| # | 标题 | 一句话 | 状态 | 篇幅 |
|---|---|---|---|---|
| 11 | TUI 差分渲染 | 为什么自己写终端 UI 库，差分渲染解决的是什么问题 | 已发布 | M |
| 12 | 扩展系统 | 事件 + 命令 + 渲染器 + 工具四类接入点；扩展能改什么、不能改什么 | 已发布 | L |
| 13 | 自扩展的含义 | `.pi/` 目录、prompts、skills；pi 用 pi 开发自己的闭环 | 已发布 | M |
| 14 | headless | RPC / SDK / server / protocol：把 pi 当库和当服务 | 已发布 | M |

### Part 5 · 工程与治理（厚，本书差异化所在）

| # | 标题 | 一句话 | 状态 | 篇幅 |
|---|---|---|---|---|
| 15 | 不做权限系统 | 「partial sandbox 会被误当成安全边界」这个论证成立吗；project trust 到底防什么 | 已发布 | L |
| 16 | 供应链硬化 | 精确锁版本、`min-release-age`、shrinkwrap、OIDC trusted publishing 的完整链条 | 已发布 | M |
| 17 | AGENTS.md | 写给 agent 的宪法：多 session 并发下的 git 纪律为什么必须写死 | 已发布 | M |
| 18 | 贡献者门禁 | 新贡献者 issue/PR 默认自动关闭；`lgtm`/`lgtmi` 两级授权 | 已发布 | M |
| 19 | spec-driven 开发 | `reserve L1` / `unreserve R3`：多 agent 在一份设计文档上并行认领 | 部分落地 | M |

### Part 6 · 评价

| # | 标题 | 一句话 | 状态 | 篇幅 |
|---|---|---|---|---|
| 20 | 借鉴清单与失效条件 | 可直接抄的 / 抄了会疼的 / 赌注未结算的；每条附「在什么条件下这个取舍失效」 | — | L |

**总计：21 章**（ch00–ch20）。计数由 `tools/stats.sh` 从 `chapters/` 实际文件数推导，禁止在页面写死。

---

## 5. 章节五段结构（硬性）

每章必须齐备以下五段，顺序固定，`<section id="s1".."s5">`：

- **§1 一句话心智模型** — `.oneliner` 一句话 + 2–3 段展开。读者只读这段也不算白读。
- **§2 代码实证** — 关键代码摘录（≤25 行）+ 每条断言的 `path:line@SHA` 引用。**这一段没有引用的句子不许存在。**
- **§3 设计动机与权衡** — 为什么这么做；替代方案是什么；上游在哪里说过（issue / RFC / 文档）或没说过（标注「未见公开论述」）。
- **§4 边界与失效条件** — 这个设计在什么输入 / 规模 / 部署形态下不成立。允许写「未发现明显边界」，但要说清检查过什么。
- **§5 拿走什么** — 2–4 条可操作结论，每条注明适用条件。

外加：章末 `.quiz` 自测 2–3 题，题型为「给一段代码/场景 → 判断 pi 会怎么做」，不是名词解释。**ch00（导读）与 ch20（评价）豁免**；其余章节由校验器 GATE 6 强制 ≥2 道，且 `data-answer` 与解释开头的加粗字母必须一致。

**§2 与 §3 的篇幅比不得低于 1:1**——低于说明在讲故事而不是读代码；§2 超过 §3 两倍则说明在抄代码而没解读。

### 代码块标签（硬性，只有两种）

本书的前提是「我们读代码」，因此把改写过的块标成「节选」是唯一不可犯的错。每个 `.tpl-head` 的 `.lines` 必须二选一：

| 标签 | class | 含义 |
|---|---|---|
| `原文 L582–L584` | `lines literal` | 逐字摘自该行区间。允许并置多个不连续区间（须写明），允许加注释但须声明「注释为本书所加」。 |
| `改写自 L167–L274` | `lines rewritten` | 为讲解压缩过：合并行、省略参数、删 emit 等。**必须在 `.tpl-foot` 说明改了什么。** |

**`原文` 块的两条书写规则**（由 `tools/check-literals.mjs` 强制）：

- **长行折行不算改写**：折行后各段仍须是源文件同一行的子串。
- **`…` 是唯一允许的省略标记**：按它切段后，各段须在源文件<b>同一行</b>中按序出现。中间省略、尾部截断都走这个记号。

改一个标识符、补一条源码里没有的注释、重排 markdown 表格的对齐——都会被 GATE 5 判红。`check-citations.mjs` 抓不到这类错误（它只校验 `a.src` 锚点），所以由 `check-literals.mjs` 单独负责。

---

## 6. 实现状态标记（本书核心机制）

上游 `packages/agent` 正在进行 harness-v2 重写。文档描述的系统与 HEAD 上跑着的系统**不是同一个**。混淆二者是本书最大的失败模式。

判定规则（写进 `data/status.json`，每章一条）：

```json
{
  "ch03": {
    "status": "已发布",
    "evidence": "packages/coding-agent/src/core/sdk.ts:294",
    "note": "coding-agent 运行时构造 Agent，走 agent-loop.ts"
  },
  "ch08": {
    "status": "部分落地",
    "evidence": "packages/agent/src/harness/agent-harness.ts:356",
    "note": "22 个 AgentLane 方法经 unavailable() 抛 HarnessNotImplemented"
  }
}
```

徽章在每章 `<header>` 的 `.meta` 中渲染，色值按 §2 表。

---

## 7. drift.html 收录标准

只收**可双向举证**的条目。每条必须有：

- 文档侧：`path:line` + 原文摘引（≤15 词）
- 代码侧：`path:line` + 事实
- 影响：读者按文档做会遇到什么

不收：笔误、格式问题、显然的历史遗留且无害者。收录判断是主观的，构建后人工过全表（QUALITY.md 第 5 条）。

两侧的 `path:line:expect` 由 GATE 3 逐条核对，与正文引用同一套机制。

---

## 8. 页脚（全站统一）

```
基于 earendil-works/pi @ ac4ac9e（2026-08-07 快照）。
仓库 commit 速度约 428/月，行号引用仅对该 SHA 有效。
```
