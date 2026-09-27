# Pi 源码解读手册 · Claude Code 构建指令

## 项目定位

双语 HTML 电子书（中文讲解 + 代码/术语/文件名保留英文原文），与本系列前作（期权手册 / AI 系统工程手册 / CCAR 备考手册 / 算法面试阈值手册）同一视觉体系。

**解读书而非文档书**：成功标准 = 读完能回答「如果我要造一个 agent harness，pi 的哪些决定我该抄、哪些该绕开、为什么」。上游自带 97 个 markdown、共 32945 行，本书**不复述文档**——本书的价值全部来自三件事：

1. **读代码而不是读 README**：每个断言锚定 `path:line@SHA`
2. **区分「已发布」与「设计文档」**：上游正在做 harness-v2 重写，文档描述的系统和跑着的系统不是同一个
3. **记录文档与代码的漂移**：一个 5565 commits / 286 位作者 / 32945 行自有文档的仓库，drift 必然存在，且没人写下来过

完整规格见 `SKELETON.md`（页面结构、章节清单、五段结构、实现状态标记的硬性约束）。
体例基准见 `chapters/ch03.html`（已审定样章，所有章节的写法、篇幅分配、引用体例以它为准）。
质量协议见 `QUALITY.md`（系列共用，批量生产的六类衰减与外部检查）。

## 锚定版本（硬性）

```
repo:   https://github.com/earendil-works/pi
SHA:    ac4ac9eaf69f2b01ca3af984a5c48f3b99b84278
date:   2026-08-07
```

- **所有代码断言必须引用该 SHA**。仓库 commit 速度约 428/月，不锚定 SHA 的行号在一周内就会失效。
- 每页页脚必须出现 SHA 短哈希与快照日期。
- `earendil-works/pi-mono` 是旧仓名，GitHub 301 重定向到 `earendil-works/pi`。**本书生成的所有链接一律用 `pi`**；上游文档里残留的 `pi-mono` 链接属于 drift，记入 `drift.html`，不要跟随。

## 硬性约定

- **Dark mode 默认**（系列惯例）
- 中文正文；代码、类型名、文件路径、包名、专有名词保留英文原文，不翻译（`AgentMessage` 不写成「智能体消息」）
- 每章 `<header>` 必须带 **实现状态** 徽章，取值仅三种：
  - `已发布` — 该章描述的代码在 HEAD 上被 `packages/coding-agent` 实际执行
  - `部分落地` — 类型/接口/测试已存在，但主要操作路径仍抛错或未接线
  - `仅设计文档` — 只存在于 `docs/*.md`，代码中无对应实现
- 引用格式统一：`<a class="src" href="{github blob url @ SHA}#L{line}">path/to/file.ts:123</a>`
- **证据分三级，写法各不相同，不得混用**：
  1. **锚定代码与仓库文档**（主体）：上一条的 `class="src"`，由 GATE 1 逐行核对 @ 锚定 SHA，计入引用总数。
  2. **锚点之后的上游追记**：`<a class="src-up" href="{github blob url @ after_anchor.upstream_sha}#L{line}">`，SHA 必须等于 `data/stats.json` 的 `after_anchor.upstream_sha`，由 GATE 1b 核对，单独计数、不计入引用总数。只能出现在「锚点之后」提示框、ch08 追记一节和 `drift.html`「上游后续」里；正文结论仍以锚定 SHA 为准，不因追记改写。
  3. **第一方公开表述**（上游博客、立场文等仓库之外的文字）：裸 `href`，**不得带** `class="src"` 或 `class="src-up"`（GATE 1 只接受 github blob URL）。必须写明发表日期及其相对锚定 SHA 的时间关系（如「锚定 SHA 之后 13 天」）；英文引文 ≤ 17 词并与原文逐字核对；只作「上游意图」的证据，不作「代码行为」的证据，并在落点处用 `.callout.no` 或正文明确标出证据级别不同；不进 `drift.html`（那里只收同一 SHA 内的双向举证）。仓库无法核实的数字（如扩展数量）不收录。
- 代码块摘录 ≤ 25 行；超过则摘关键片段 + 链接全文
- 章节间交叉引用一律相对路径，不写死站点域名

## 质量规则

### 批量生产六条教训（来自 AI 系统手册返工，逐条执行）

1. 攻击 worked examples 而不是散文——代码摘录、行号、计数是错误重灾区，逐个核验
2. 标记所有绝对化表述（「总是/唯一/不可能/所有」），逐条审证据
3. 对校验器做 mutation test：故意注入错误，确认校验器真能抓到
4. 全局数量（包数、LOC、commit 数、contributor 数、tool 数、event 数）程序化统计，禁止手写
5. 涉及主观判断的收录/取舍页面（ch20 借鉴清单、drift.html），构建后人工过一遍
6. 修复某个错误表述前，先 grep 全站所有变体，一次修完；发布前跑站级横切检查

### 本书专属校验器（构建流水线必须包含）

1. **引用可解析**：`tools/check-citations.mjs` 从 `git show <SHA>:<path>` 取出每条 `path:line` 引用指向的实际行，与页面上标注的锚点内容比对。**必须做 mutation test**：把某条引用行号 ±5，确认校验器变红。只检查「有没有写引用」不作数。
2. **计数程序化**：`tools/stats.sh` 生成 `data/stats.json`，所有数字从它注入，禁止在 HTML 里手写任何统计量。CI 校验：页面出现的数字 ⊆ stats.json 的值。
3. **实现状态可证**：每个标 `已发布` 的章节，须在 `data/status.json` 中给出至少一条「coding-agent 侧调用点」的 `path:line`；标 `部分落地` 的须给出抛错点或未接线证据的 `path:line`。
4. **死链检查**：全站内部链接 + GitHub blob 链接（后者抽样 HTTP 检查，避免打满限流）
5. **drift 双向核对**：`drift.html` 每条记录须同时给出「文档说法」和「代码事实」两侧的 `path:line`，缺一侧的条目不予收录
6. **「原文」块逐字核对**（`tools/check-literals.mjs`）：标了 `lines literal` 的代码块，每一行必须在源文件中逐字存在。**这条原本写作「人工审读点」，但人工审读点不会真跑——已改为机器检查。**

## 构建顺序

1. 站点骨架 + 视觉体系移植（`assets/handbook.css` 从 leetcode-handbook 移植，语义色重映射见 SKELETON §2）
2. `tools/stats.sh` + `data/stats.json`
3. 样章 ch03（人工审定后作为体例基准）
4. 按样章体例批量产出其余章节
5. 导读、glossary、drift、sources 三张辅助页
6. 全部校验器 + 六条教训检查 + 站级横切检查
7. 人工审读点：ch08/ch19 实现状态判定、ch20 收录取舍、drift.html 全表、「改写自」块的脚注说明

## 反模式（本书最容易掉进去的坑）

- ❌ 把 `docs/extensions.md` 的 API 列表抄成一章——那是文档，不是解读
- ❌ 用 README 的一段话就下结论（尤其 ch15 无权限系统，必须读 `docs/security.md` + `docs/containerization.md` 原文再写）
- ❌ 把 `harness-v2.md` 的 lanes/records/checkpoints 当成「pi 的架构」——它是设计文档，读者在代码里找不到
- ❌ 为了显得批判而制造批判。ch20 的诚实写法是「这个取舍在什么条件下失效」，不是「这个决定是错的」
