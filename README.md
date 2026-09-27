# Pi 源码解读手册

对 [`earendil-works/pi`](https://github.com/earendil-works/pi) 的第三方深入解读，锚定 `ac4ac9e`（2026-08-07 快照）。

静态 HTML 电子书，与本系列前作（期权 / AI 系统工程 / CCAR / 算法面试手册）同一视觉体系，dark mode 默认。

```bash
python3 -m http.server 8899   # 然后打开 http://localhost:8899
```

## 这本书做什么

上游自带 97 个 markdown、共 32945 行文档。所以本书**不复述文档**，它做三件文档做不到的事：

1. **读代码而不是读 README** — 每条关于行为的断言锚定 `path:line`，并由校验器逐条核对该行的实际内容
2. **区分「已发布」与「设计文档」** — 上游正在重写 agent harness；文档描述的系统与运行的系统不是同一个
3. **记录文档与代码的漂移** — 双向举证，两侧各给一个 `path:line`

最重要的发现：那份 3437 行的 durable harness 设计文档所描述的执行器，在锚定版本上有 **22 个方法直接抛错**，且没有任何生产代码路径构造它。见 `chapters/ch08.html`。

**锚点之后**：上游此后实现了其中大部分方法，但默认 CLI 仍走 `new Agent`。本书**没有换锚点**，只在首页、ch00/08/19/20 与 `drift.html#after-anchor` 加了追记。追记引用的是上游另一个固定提交（`tools/stats.sh` 里的 `UPSTREAM`），计数由 `stats.sh` 从该提交推导进 `data/stats.json` 的 `after_anchor`，引用由 GATE 1b 核对。刷新追记：改 `UPSTREAM` 后重跑 `tools/build.sh`。

## 引用数的几种口径

同一本书会看到几个不同的「引用数」，它们数的东西不同（具体数值以脚本输出为准）：

| 在哪里看到 | 数的是什么 | 由谁算 |
|---|---|---|
| 首页、`sources.html`、主页卡片（如 154） | **去重后的 `path:line` 落点**：同一行被多章引用只算一次 | `tools/gen-aux.mjs` 的 `totalRefs` |
| `check-citations.mjs` 输出的「引用 N 条」（如 208） | **页面上每一个 `<a class="src">`**：重复引用逐个计数，是门禁实际核对的条数 | `tools/check-citations.mjs` |
| 「追记引用 N 条」 | 锚点之后追记里的 `<a class="src-up">`，指向上游追记提交，**不计入上面两项** | `tools/check-citations.mjs` GATE 1b |

本地未发布分支 `harness-post-integration` 上的门禁计数（如 214）包含该分支新增的引用，与线上 `main` 不同。

## 构建

```bash
tools/build.sh
```

依次执行：统计 → 生成 index/sources/drift → 生成 glossary → 站级校验（release 模式）→「原文」逐字核对 → 校验器自检。

| 脚本 | 作用 |
|---|---|
| `tools/stats.sh` | 从锚定 SHA 的工作树推导全部数字 → `data/stats.json`；另从上游追记提交推导 `after_anchor`（只读 `git show`，不移动工作树）。**页面里不允许手写任何统计量** |
| `tools/gen-aux.mjs` | 从章节与 `data/*.json` 生成 `index.html` / `sources.html` / `drift.html` |
| `tools/gen-glossary.mjs` | 生成 `glossary.html`；术语收录靠人工，「首见章节」靠脚本推导 |
| `tools/check-citations.mjs` | GATE 1、1b、2–4（见下）。加 `--release` 让死链也算错误 |
| `tools/check-literals.mjs` | GATE 5：「原文」代码块逐字核对 |
| `tools/mutate-test.sh` | 对全部门禁做 mutation test，全部注入必须变红 |

## 五道门禁

| GATE | 检查 | 实质性保证 |
|---|---|---|
| 1 引用可解析 | 每个 `<a class="src">` 的 SHA / 路径 / 行号 / 锚文本 | **该行实际内容必须包含 `data-expect` 片段**——这是唯一能挡住行号漂移的检查，因此 `data-expect` 必填 |
| 1b 追记可解析 | 每个 `<a class="src-up">` | SHA 必须等于 `stats.json` 的 `after_anchor.upstream_sha`，其余同 GATE 1（该行须含 `data-expect`） |
| 2 实现状态可证 | 每章头部徽章 ↔ `data/status.json` | 每条 evidence 的 `path:line:expect` 同样按 GATE 1 核对 |
| 3 漂移双向举证 | `data/drift.json` 每条 | `doc_side` 与 `code_side` 缺一即红 |
| 4 内部死链 | 所有相对 href | 建设期为 warning，`--release` 时为 error |
| 5a「原文」逐字 | 每个 `class="lines literal"` 代码块 | **块内每一行去空白后必须在源文件中逐字存在**；`…` 是显式省略标记，切段后各段须在同一源码行中按序出现 |
| 5b「改写」披露 | 每个 `class="lines rewritten"` 代码块 | **`tpl-foot` 必须说明改了什么**（只看脚注——标签里必然含「改写」二字，拿它当证据等于没查） |

**全部门禁经过 mutation test**（QUALITY.md 第 3 条：没做过 mutation test 的门禁，其「0 错误」不作数）。注入包括：行号 ±5、锚文本不符、删除 `data-expect`、SHA 错误、文件不存在、追记引用的行号漂移 / 改用锚定 SHA / 删除 `data-expect`、status 与页面不符、status 孤儿条目、徽章 class 与文案不符、drift 缺一侧、drift 行号漂移、死链、原文块改一个标识符、原文块插入源码中没有的行、改写块脚注被抽空——全部必须变红，且干净树必须变绿。

（这套 mutation test 的价值不是理论上的：最后一条注入当场抓出了 GATE 5b 自身的一个漏洞——它原本同时接受标签里的「改写」二字作为披露证据，而那两个字对该类块必然存在，检查等于空转。）

## 已验证的横切面

| 项 | 结论 |
|---|---|
| 打印导出 | A4 宽度下 `sources.html` 宽表不溢出（612px / 660px）；深色模式下打印强制浅色；`原文`/`改写自` 标签在纸上降级为 `=` / `*` 前缀仍可辨 |
| 移动端窄屏 | 375px 下页面本体不横向滚动；宽表与代码块在各自 `overflow-x` 容器内滚动 |
| 深色 / 浅色 | 两种主题下逐页抽查；状态徽章三色在两种主题下均可辨 |

## 目录

```
index.html          目录页（生成）
chapters/ch00–ch20  正文 21 章
glossary.html       术语表（生成）
drift.html          漂移记录（生成）
sources.html        溯源索引（生成）
assets/             样式与脚本
data/               stats.json / status.json / drift.json
tools/              构建与校验
repo/               上游克隆（锚定 SHA，不入库）
```

规格见 [`SKELETON.md`](SKELETON.md)，构建指令见 [`CLAUDE.md`](CLAUDE.md)，质量协议见 [`QUALITY.md`](QUALITY.md)（系列共用）。

## 人工审读点

脚本查不了、每次改动后需人过一遍（QUALITY.md 第 5 条）：

- ch08 / ch19 的实现状态判定
- ch20 §2/§3/§4 的收录与分类取舍（本章是判断，不是事实）
- `drift.html` 全表
- 「改写自」块脚注的说明是否**准确**（GATE 5b 只能确认脚注里有说明，不能确认说的是实话）

## 已知边界

- 本书读代码与文档，**没有运行 pi 做端到端行为验证**
- 未审计 `packages/tui` 的渲染正确性与 `packages/ai` 各 provider 适配的正确性（合计约占上游 36% 代码）
- 漂移记录仅 3 条，是写作过程中的顺手发现，非系统性扫描结果

完整的自我边界声明见 `chapters/ch20.html` §4。

---

本书与 pi 项目无关联。上游代码与文档版权归其作者所有；引用均标注 `path:line@SHA` 并链接原文。
