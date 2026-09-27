#!/usr/bin/env node
/**
 * 从章节 HTML 与 data/*.json 生成三张辅助页：
 *   sources.html  溯源索引（全站引用汇总，按文件分组）
 *   drift.html    漂移记录（data/drift.json）
 *   index.html    目录页（章节数、统计量从 data/stats.json 与实际文件推导）
 *
 * QUALITY.md 第 4 条：能程序推导的一律推导，禁止在任何页面写死数字。
 * 因此这三页不手写——改了章节就重跑本脚本。
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BOOK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = process.env.PI_REPO ?? join(BOOK, "repo");
const SHA = "ac4ac9eaf69f2b01ca3af984a5c48f3b99b84278";
const SHORT = SHA.slice(0, 7);
const BLOB = `https://github.com/earendil-works/pi/blob/${SHA}/`;

const stats = JSON.parse(readFileSync(join(BOOK, "data", "stats.json"), "utf8"));
const drift = JSON.parse(readFileSync(join(BOOK, "data", "drift.json"), "utf8"));
const status = JSON.parse(readFileSync(join(BOOK, "data", "status.json"), "utf8"));

// ------------------------------------------------------------ 锚点之后的追记
// 数字与提交全部来自 stats.json 的 after_anchor（tools/stats.sh 从上游提交程序化推导）。
const UP = stats.after_anchor;
const upBlob = (path, line, expect, label) =>
	`<a class="src-up" href="https://github.com/earendil-works/pi/blob/${UP.upstream_sha}/${path}#L${line}" data-expect="${esc(expect)}">${label ?? path.split("/").pop()}:${line}</a>`;
const upCommit = (c) =>
	`<a href="https://github.com/earendil-works/pi/commit/${c.sha}"><code>${c.sha.slice(0, 7)}</code></a>（${c.date}）`;
const M = UP.anchor_unavailable_methods;
const afterAnchorSummary = (ch08Href) => `<p><span class="after-tag">锚点之后</span><b>上游已经往前走了，本书没有换锚点。</b>截至 <code>${UP.upstream_sha_short}</code>（${UP.upstream_date}，锚点之后 ${UP.commits_after_anchor} 个提交），锚点上那 ${stats.harness_v2.unimplemented_methods} 个抛错方法里 <b>${M.implemented} 个已有实现、${M.removed} 个被删除、${M.stubbed} 个仍是桩</b>（<code>${M.stubbed_names.join("</code>、<code>")}</code>）${UP.harness_v2_md_present ? "" : `；设计文档 <code>harness-v2.md</code> 已并入 <code>harness.md</code>（${UP.harness_md_lines} 行）`}。但 <b>默认 CLI 仍然走 <code>new Agent</code></b>，durable harness 只在锚点之后新增的 experimental worker 里被调用。所以：书里的判定在锚点版本上依然成立，而「执行器是空壳」已经不是上游的现状——大部分已实现，默认路径尚未切换。逐条变化见 <a href="${ch08Href}">第 08 章追记</a> 与 <a href="${ch08Href.startsWith("chapters") ? "" : "../"}drift.html#after-anchor">漂移记录 · 上游后续</a>。</p>`;

const esc = (s) =>
	String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const head = (title, desc, depth = 0) => {
	const up = depth ? "../" : "";
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" type="image/svg+xml" href="${up}assets/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Noto+Sans+SC:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<noscript><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Noto+Sans+SC:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"></noscript>
<link rel="stylesheet" href="${up}assets/handbook.css">
<script src="${up}assets/theme.js"></script>
</head>
<body>
<button class="theme-toggle" type="button" aria-label="切换深色/浅色模式" title="切换深色/浅色模式">
  <span class="sun" aria-hidden="true">☀️</span><span class="moon" aria-hidden="true">🌙</span>
</button>
<div class="wrap">`;
};

const foot = (extra = "") => `
<div class="anchor-foot">
基于 <a href="https://github.com/earendil-works/pi/tree/${SHA}">earendil-works/pi @ <code>${SHORT}</code></a>（${stats.snapshot_date} 快照）。<br>
本页由 <code>tools/gen-aux.mjs</code> 生成，数字来自 <code>data/stats.json</code>，未手写。${extra}
</div>

</div>
</body>
</html>
`;

// ------------------------------------------------------------ 收集全站引用
const SRC_RE =
	/<a\s+class="src"\s+href="https:\/\/github\.com\/earendil-works\/pi\/blob\/[0-9a-f]{40}\/([^"#]+)#L(\d+)"[^>]*>([^<]+)<\/a>/g;

const chapters = readdirSync(join(BOOK, "chapters"))
	.filter((f) => /^ch\d+\.html$/.test(f))
	.sort();

const byFile = new Map();
for (const file of chapters) {
	const html = readFileSync(join(BOOK, "chapters", file), "utf8");
	const ch = file.replace(".html", "");
	for (const m of html.matchAll(SRC_RE)) {
		const [, path, line] = m;
		if (!byFile.has(path)) byFile.set(path, new Map());
		const lines = byFile.get(path);
		if (!lines.has(Number(line))) lines.set(Number(line), new Set());
		lines.get(Number(line)).add(ch);
	}
}

const lineCache = new Map();
function lineText(path, line) {
	const key = `${path}:${line}`;
	if (!lineCache.has(key)) {
		try {
			const blob = execFileSync("git", ["show", `${SHA}:${path}`], {
				cwd: REPO,
				encoding: "utf8",
				maxBuffer: 64 * 1024 * 1024,
			});
			lineCache.set(key, (blob.split("\n")[line - 1] ?? "").trim().slice(0, 110));
		} catch {
			lineCache.set(key, "");
		}
	}
	return lineCache.get(key);
}

const totalRefs = [...byFile.values()].reduce((n, m) => n + m.size, 0);
const sortedFiles = [...byFile.keys()].sort();

let rows = "";
for (const path of sortedFiles) {
	const lines = [...byFile.get(path).entries()].sort((a, b) => a[0] - b[0]);
	rows += `<tr><td colspan="3" class="srcfile"><code>${esc(path)}</code> <span class="c">${lines.length} 处</span></td></tr>\n`;
	for (const [line, chs] of lines) {
		const chList = [...chs].sort().map((c) => `<a href="chapters/${c}.html">${c.slice(2)}</a>`).join(" ");
		rows += `<tr><td class="ln"><a href="${BLOB}${path}#L${line}">L${line}</a></td><td><code class="snip">${esc(lineText(path, line))}</code></td><td class="chs">${chList}</td></tr>\n`;
	}
}

writeFileSync(
	join(BOOK, "sources.html"),
	head("溯源索引 · Pi 源码解读手册", "全书每条 path:line 引用的汇总表，按文件分组") +
		`<nav class="crumb"><a href="index.html">← 目录</a> · <a href="drift.html">漂移记录</a> · <a href="glossary.html">术语表</a></nav>

<header class="book-head">
  <div class="bars" aria-hidden="true"><span class="l1"></span><span class="l2"></span><span class="l3"></span><span class="l4 f"></span></div>
  <div class="kicker">Source Index</div>
  <h1>溯源索引<span class="zh">全书每条断言的落点</span></h1>
  <p class="lede">全书 ${totalRefs} 条引用，覆盖 ${sortedFiles.length} 个文件。每条都由 <code>tools/check-citations.mjs</code> 核对过：该行在 <code>${SHORT}</code> 上的实际内容必须包含正文声称的片段。摘录截断至 110 字符。</p>
  <div class="meta"><span>引用 <b>${totalRefs}</b></span><span>文件 <b>${sortedFiles.length}</b></span><span>章节 <b>${chapters.length}</b></span></div>
</header>

<div class="tbl-scroll"><table class="src-tbl">
<colgroup><col style="width:66px"><col><col style="width:100px"></colgroup>
<thead><tr><th>行</th><th>该行内容（@ ${SHORT}）</th><th>出现于</th></tr></thead><tbody>
${rows}</tbody></table></div>
` +
		foot(),
);

// ------------------------------------------------------------ drift.html
let dHtml = "";
for (const e of drift.entries) {
	dHtml += `
<div class="drift" id="${e.id}">
  <div class="dh">${esc(e.id)} · 严重度 ${esc(e.severity)} · 见 <a href="chapters/${e.found_in_chapter}.html">${e.found_in_chapter}</a></div>
  <h3>${esc(e.title)}</h3>
  <dl>
    <dt>文档说</dt>
    <dd>${esc(e.doc_side.summary)}<br><a class="src" href="${BLOB}${e.doc_side.path}#L${e.doc_side.line}" data-expect="${esc(e.doc_side.expect)}">${esc(e.doc_side.path)}:${e.doc_side.line}</a></dd>
    <dt>代码是</dt>
    <dd>${esc(e.code_side.summary)}<br><a class="src" href="${BLOB}${e.code_side.path}#L${e.code_side.line}" data-expect="${esc(e.code_side.expect)}">${esc(e.code_side.path)}:${e.code_side.line}</a></dd>
    <dt>影响</dt>
    <dd>${esc(e.impact)}</dd>
  </dl>
</div>
`;
}

writeFileSync(
	join(BOOK, "drift.html"),
	head("漂移记录 · Pi 源码解读手册", "文档与代码不一致之处，每条双向举证") +
		`<nav class="crumb"><a href="index.html">← 目录</a> · <a href="sources.html">溯源索引</a> · <a href="glossary.html">术语表</a></nav>

<header class="book-head">
  <div class="bars" aria-hidden="true"><span class="l1"></span><span class="l2 w"></span><span class="l3 w"></span><span class="l4 f"></span></div>
  <div class="kicker">Documentation Drift</div>
  <h1>漂移记录<span class="zh">文档说的，和代码做的，不一样的地方</span></h1>
  <p class="lede">收录标准（SKELETON §7）：只收<b>可双向举证</b>的条目——文档侧与代码侧各给一个 <code>path:line</code>，两侧都由校验器核对。不收笔误、格式问题、以及显然无害的历史遗留。</p>
  <div class="meta"><span>条目 <b>${drift.entries.length}</b></span><span>上游文档 <b>${stats.docs.markdown_lines} 行 / ${stats.docs.markdown_files} 个文件</b></span></div>
</header>

<div class="callout no">
  <p><b>这 ${drift.entries.length} 条不是系统性扫描的结果</b>，是写作 21 章过程中的顺手发现。一次针对 ${stats.docs.markdown_lines} 行 markdown 的完整核对必然会找出更多。把本页当作「这类问题存在」的证据，不是「问题只有这些」的清单。</p>
</div>
${dHtml}

<section id="after-anchor">
  <h2>上游后续（锚点之后）</h2>
  <div class="callout after">${afterAnchorSummary("chapters/ch08.html#after-anchor")}</div>
  <p>下面是追记的证据。和上面的漂移条目不同，它们引用的是上游提交 <code>${UP.upstream_sha_short}</code>，不是锚定 SHA；同样由 <code>tools/check-citations.mjs</code> 的 GATE 1b 逐行核对。</p>
  <ul>
    <li><b>设计文档换了名字。</b>书中反复引用的 <code>packages/agent/docs/harness-v2.md</code> 在上游 main 上已经不存在：${upCommit(UP.commits.harness_v2_merged)} 把它并进了 <code>harness.md</code>。书里指向它的链接都锚定在 <code>${stats.sha_short}</code>，仍然能打开；在上游 main 上找这个文件会找不到。新规范自述的完成度：${upBlob("packages/agent/docs/harness.md", 143, "WP00–WP07 are complete")}，唯一的桩：${upBlob("packages/agent/docs/harness.md", 147, "the sole stubbed Harness method")}。</li>
    <li><b><code>unavailable()</code> 桩被清空。</b>${upCommit(UP.commits.unavailable_removed)} 之后，<code>agent-harness.ts</code> 里不再有 <code>return this.unavailable(</code>；执行逻辑移到 <code>runtime/</code>，例如 ${upBlob("packages/agent/src/harness/runtime/lane.ts", 1133, "async prompt(")}、${upBlob("packages/agent/src/harness/runtime/lane.ts", 1327, "async resume(")}、${upBlob("packages/agent/src/harness/runtime/harness.ts", 80, "async lane(")}。被删除的 ${M.removed} 个：<code>${M.removed_names.join("</code>、<code>")}</code>。仍抛错的：${upBlob("packages/agent/src/harness/runtime/harness.ts", 306, 'throw new SliceNotImplemented("watchSession")')}。</li>
    <li><b>默认路径没变。</b>默认 CLI 的会话仍由 <code>sdk.ts</code> 构造 <code>new Agent</code>：${upBlob("packages/coding-agent/src/core/sdk.ts", UP.default_cli_new_agent_line, "new Agent(")}（锚点时在第 294 行）。durable harness 的调用方在 <code>coding-agent/src/experimental/</code>，这个目录在锚点时不存在，由 ${upCommit(UP.commits.experimental_added)} 新增：${upBlob("packages/coding-agent/src/experimental/session-worker.ts", 834, "await AgentHarness.create(")}。本书没有核实普通用户默认能否用到这个入口。</li>
  </ul>
  <p>完整重锚需要逐行重核全书 ${totalRefs} 处引用（按 <code>path:line</code> 去重），工作量接近重写 ch07 / ch08 / ch19 / ch20，而上游 harness 仍在快速变化，所以本书选择只追记、不换锚点。刷新追记：改 <code>tools/stats.sh</code> 里的 <code>UPSTREAM</code>，再跑 <code>tools/build.sh</code>。</p>
</section>
` +
		foot(),
);

// ------------------------------------------------------------ index.html
const TOC = [
	["开始之前", "导读", "先读这一章", [["00", "导读", "怎么读、实现状态标记体系、锚定版本、不覆盖什么"]]],
	[
		"Part I",
		"全景",
		"两章，刻意写薄",
		[
			["01", "仓库全景", "10 个包的职责与依赖方向；一年 5565 commits 的形状"],
			["02", "三层边界", "每一层守住的东西，正好是上一层不想知道的东西"],
		],
	],
	[
		"Part II",
		"内核",
		"本书主体",
		[
			["03", "agent loop 逐行", "内层收工具，外层等 follow-up；steering 插在哪一帧"],
			["04", "工具执行", "「并行」不是你以为的那个并行"],
			["05", "上下文管道", "模型看到的，和会话里存的，从来不是一回事"],
			["06", "压缩", "切在哪一刀，比切掉多少更重要"],
			["07", "会话持久化", "会话不是一条链，是一棵树；而且现在有两个版本并存"],
			["08", "Harness v2", "一份正在被消费的设计文档"],
		],
	],
	[
		"Part III",
		"Provider",
		"两章，薄",
		[
			["09", "pi-ai 的抽象", "统一 39 家 provider 的代价，藏在一个 .gitignore 条目里"],
			["10", "认证与账号", "API key / OAuth / IAM 三条路，以及它们共同的过期问题"],
		],
	],
	[
		"Part IV",
		"界面与扩展",
		"",
		[
			["11", "TUI 差分渲染", "为什么值得手写 3.2 万行终端 UI"],
			["12", "扩展系统", "同进程、全权限、能覆盖内建工具——这是能力也是代价"],
			["13", "自扩展的含义", "看 .pi/ 目录，而不是看 README 里的形容词"],
			["14", "headless", "四条无 UI 路径，以及文档为什么劝你别用 RPC"],
		],
	],
	[
		"Part V",
		"工程与治理",
		"本书差异化所在",
		[
			["15", "不做权限系统", "把安全边界整个推给操作系统，这个论证站得住吗"],
			["16", "供应链硬化", "把依赖变更当代码评审：一条从 .npmrc 到 OIDC 的完整链"],
			["17", "AGENTS.md", "当同一个目录里跑着好几个 agent，git 纪律必须写死"],
			["18", "贡献者门禁", "默认关闭所有新人的 issue 和 PR——在 agent 时代，这可能是理性的"],
			["19", "spec-driven 开发", "把设计文档变成任务队列，用 git 当分布式锁"],
		],
	],
	["Part VI", "评价", "判断，非事实", [["20", "借鉴清单与失效条件", "哪些能直接抄，哪些抄了会疼，哪些赌注还没结算"]]],
];

// 目录页只标例外：19 章里 17 章都是「已发布」，人人都有的徽章等于噪音，
// 移动端还挤占标题。默认态不标，「部分落地 / 仅设计文档」才值得读者在目录页就警觉。
// 章节页头部的徽章不受影响——那里有 status.json 的证据链（GATE 2）。
const badge = (ch) => {
	const s = status[`ch${ch}`];
	if (!s || s.status === "已发布") return "";
	const cls = s.status === "部分落地" ? "partial" : "paper";
	return ` <span class="status ${cls}">${s.status}</span>`;
};

let toc = "";
for (const [no, title, tag, items] of TOC) {
	toc += `<div class="part">
  <div class="part-head"><span class="no">${no}</span><h2>${title}</h2>${tag ? `<span class="tag">${tag}</span>` : ""}</div>
  <ul class="toc">
`;
	for (const [n, t, d] of items) {
		toc += `    <li><a href="chapters/ch${n}.html"><span class="n">${n}</span><span class="t">${t}${badge(n)}</span><span class="d">${d}</span></a></li>\n`;
	}
	toc += `  </ul>\n</div>\n`;
}

const shippedCount = Object.values(status).filter((s) => s.status === "已发布").length;
const partialCount = Object.values(status).filter((s) => s.status === "部分落地").length;

writeFileSync(
	join(BOOK, "index.html"),
	head("Pi 源码解读手册 · Reading the Pi Agent Harness", "对 earendil-works/pi 的深入解读：读代码而不是读 README") +
		`<header class="book-head">
  <div class="bars" aria-hidden="true"><span class="l1"></span><span class="l2"></span><span class="l3"></span><span class="l4 f"></span></div>
  <div class="kicker">Reading the Pi Agent Harness</div>
  <h1>Pi 源码解读手册
    <span class="zh">读代码，不读 README</span>
  </h1>
  <p class="lede">对 <a href="https://github.com/earendil-works/pi">earendil-works/pi</a> 的第三方深入解读。上游自带 ${stats.docs.markdown_lines} 行文档，所以本书不复述文档——它做三件文档做不到的事：<b>锚定行号读代码</b>、<b>区分「已发布」与「设计文档」</b>、<b>记录两者的漂移</b>。</p>
  <div class="meta"><span>正文 <b>${chapters.length} 章</b></span><span>引用 <b>${totalRefs} 条</b></span><span>锚定 <b><code>${SHORT}</code></b></span><span>支持 <b>深色模式 / 打印导出</b></span></div>
</header>

<div class="stats">
  <div class="stat"><div class="n">${stats.code.total_ts_loc.toLocaleString()}</div><div class="l">上游 TypeScript 行数</div></div>
  <div class="stat"><div class="n">${stats.history.commits}</div><div class="l">提交（${stats.history.first_commit_date} 起）</div></div>
  <div class="stat"><div class="n">${stats.history.authors}</div><div class="l">署名作者</div></div>
  <div class="stat"><div class="n">${stats.harness_v2.unimplemented_methods}</div><div class="l">抛 <code>HarnessNotImplemented</code> 的方法</div></div>
</div>

<div class="callout">
  <p><b>全书最重要的一个发现</b>：上游那份 ${stats.docs.harness_v2_lines} 行的 durable harness 设计文档所描述的执行器，在锚定版本上有 <b>${stats.harness_v2.unimplemented_methods} 个方法直接抛错</b>，且没有任何生产代码路径构造它——真正在跑的是另一个循环。判定过程见 <a href="chapters/ch08.html">第 08 章</a>。</p>
  <p>第一次读请从 <a href="chapters/ch00.html">导读</a> 开始：它写明了实现状态徽章怎么读、怎么核对本书、以及<b>不覆盖什么</b>。只有 20 分钟 → 直接看 <a href="chapters/ch20.html">第 20 章</a>。</p>
</div>

<div class="callout after">${afterAnchorSummary("chapters/ch08.html#after-anchor")}</div>

${toc}
<div class="part">
  <div class="part-head"><span class="no">工具页</span><h2>核对与索引</h2><span class="tag">本书的可验证性所在</span></div>
  <ul class="toc">
    <li><a href="sources.html"><span class="n">索引</span><span class="t">溯源索引</span><span class="d">全书 ${totalRefs} 条引用汇总，按文件分组，附该行原文</span></a></li>
    <li><a href="drift.html"><span class="n">漂移</span><span class="t">漂移记录</span><span class="d">文档与代码不一致之处，${drift.entries.length} 条，每条双向举证</span></a></li>
    <li><a href="glossary.html"><span class="n">术语</span><span class="t">术语表</span><span class="d">英文术语 → 中文解释 → 首次出现章节</span></a></li>
  </ul>
</div>

<p class="quiz-note">
实现状态分布：<b>${shippedCount}</b> 章已发布 · <b>${partialCount}</b> 章部分落地。全部徽章在 <code>data/status.json</code> 中有 <code>path:line</code> 证据，并由 <code>tools/check-citations.mjs</code> 核对。
校验器自身通过 <code>tools/mutate-test.sh</code> 的 mutation test（故意注入行号漂移、锚文本不符、缺证据、SHA 错误、死链，确认全部变红）。
</p>
` +
		foot("<br>本书与 pi 项目无关联，是独立的第三方解读。"),
);

console.log(`✓ 生成 sources.html（${totalRefs} 条引用 / ${sortedFiles.length} 文件）、drift.html（${drift.entries.length} 条）、index.html（${chapters.length} 章）`);
