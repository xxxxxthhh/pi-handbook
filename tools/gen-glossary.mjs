#!/usr/bin/env node
/**
 * 生成 glossary.html。
 *
 * 术语条目手工编纂（收录判断靠人，QUALITY.md 第 5 条），但「首次出现章节」
 * 由脚本扫描章节 HTML 推导，避免手写章节号漂移。
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BOOK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHA = "ac4ac9eaf69f2b01ca3af984a5c48f3b99b84278";
const SHORT = SHA.slice(0, 7);
const stats = JSON.parse(readFileSync(join(BOOK, "data", "stats.json"), "utf8"));

/** [术语, 类别, 中文解释, 用于定位首次出现的搜索串（默认取术语本身）] */
const TERMS = [
	["agent loop", "核心", "「调模型 → 跑工具 → 再调模型」的循环。pi 的实现是双层 while：内层收工具与 steering，外层等 follow-up。"],
	["AgentMessage", "核心", "pi 会话内部的消息类型，比 LLM 认的三种 role 多出 bashExecution / custom / branchSummary / compactionSummary。"],
	["steering", "核心", "「插话」。在 agent 跑动过程中注入的消息，在每个 turn 结束后被轮询，下一个 turn 生效。"],
	["follow-up", "核心", "「追加」。只在 agent 本该停下时才被轮询的消息队列；有的话就再跑一轮。"],
	["terminate", "核心", "工具结果上的标志，提示循环可以提前收工。判定是「全票通过」——一批里全部标了才生效。", "terminate"],
	["convertToLlm", "核心", "把 AgentMessage[] 映射成 LLM 认的 Message[] 的必填函数。四种自定义 role 全被压成 user。"],
	["transformContext", "核心", "每次 LLM 调用前改写上下文的可选钩子。在 coding-agent 里等于「扩展说了算」。"],
	["compaction", "上下文", "上下文压缩。在合法切点上把前半段换成一段 LLM 生成的摘要，结果写进会话文件。"],
	["cut point", "上下文", "压缩的切点。合法性由 role 白名单决定，toolResult 永远不是合法切点。", "isCutPointMessage"],
	["keepRecentTokens", "上下文", "压缩时想保留的近期 token 数（默认 20000）。因为切点要往前滑，实际保留量总是 ≥ 该值。"],
	["reserveTokens", "上下文", "触发压缩的余量（默认 16384）。留给模型回答用，不是安全余量。"],
	["branch summarization", "上下文", "/tree 导航切换分支时生成的摘要，与压缩共用摘要格式。", "branchSummary"],
	["entry", "会话", "会话日志里的一条记录，带 id / seq / parentId / timestamp。树结构由 parentId 隐式构成。"],
	["record", "会话", "v4 新增的执行痕迹（operation_started 等 9 种），供崩溃恢复用。v3 会话里没有。", "RECORD_TYPES"],
	["lane", "会话", "harness-v2 概念：会话树上的一个具名位置，每个 lane 同时最多跑一个操作。<b>执行层尚未实现</b>。"],
	["session v3 / v4", "会话", "CLI 当前写 v3；新 harness 栈写 v4（含 record）。v4 能读 v3，但只能恢复到 idle。", "CURRENT_SESSION_VERSION"],
	["fork", "会话", "复制会话。scope: \"branch\" 只复制到某 entry 的路径，scope: \"tree\" 复制整棵树。", "ForkOptions"],
	["HarnessNotImplemented", "harness-v2", "AgentHarness 未完成方法统一抛出的错误。22 个方法用它——这是工作包 F0 的<b>交付物</b>，不是疏漏。"],
	["work package", "harness-v2", "设计文档 §20 里的一个可认领任务单元。共 41 个，分 9 个 Track，构成一张依赖 DAG。"],
	["reserve / unreserve", "harness-v2", "认领协议：往设计文档加一行 Reserved 标记并单独提交；先进 main 者得。放弃则删标记不勾复选框。", "unreserve"],
	["provider", "pi-ai", "一家 LLM 服务的接入实现。仓库有 39 个 *.models.ts，其中含同厂商的不同接入方式与区域变体。"],
	["models.generated.ts", "pi-ai", "汇总全部 provider 模型目录的生成文件。真实数据在 gitignore 掉的 data/*.json 里，构建时拉取。"],
	["tool calling", "pi-ai", "函数调用。pi-ai 只收录支持它的模型——这条收录标准把它与通用 LLM SDK 区分开。"],
	["differential rendering", "TUI", "只重画变化的行，而不是整屏重绘。配合终端的 synchronized output 做到无闪烁。"],
	["extension", "扩展", "同进程运行的 TypeScript 模块，权限与 pi 进程相同。可覆盖内建工具、改上下文、接管渲染。"],
	["skill", "扩展", "写成 SKILL.md 的可复用工作流，模型可按需调用。pi 自己带一个 add-llm-provider。"],
	["prompt template", "扩展", ".pi/prompts/*.md，带 YAML frontmatter 的可调用 prompt（/wr、/cl、/sa 等）。", "prompt 模板"],
	["project trust", "安全", "控制 pi <b>启动时加载哪些项目资源</b>的守卫。<b>不是沙箱</b>——它不限制运行起来之后能碰什么。"],
	["Gondolin", "安全", "本地 Linux micro-VM。作为扩展把内建工具与 ! 命令路由进 VM，同时把凭证留在宿主。"],
	["min-release-age", "供应链", "npm 解析依赖时跳过发布不足 N 天的版本。pi 设为 2，专挡「发布后数小时内被发现」的投毒。"],
	["shrinkwrap", "供应链", "发布的 CLI 包内附 npm-shrinkwrap.json，为 npm 用户钉死传递依赖。"],
	["trusted publishing", "供应链", "经 GitHub Actions OIDC 发布 npm 包，无需本地长期 token / OTP。"],
	["lgtm / lgtmi", "治理", "维护者授权命令。lgtmi 只开 issue，lgtm 开 issue + PR。必须出现在回复开头或结尾。", "lgtmi"],
	["auto-close", "治理", "新贡献者的 issue 与 PR 默认自动关闭，维护者每日审阅并重开值得的。"],
];

const chapters = readdirSync(join(BOOK, "chapters"))
	.filter((f) => /^ch\d+\.html$/.test(f))
	.sort();
const chapterText = chapters.map((f) => [f.replace(".html", ""), readFileSync(join(BOOK, "chapters", f), "utf8")]);

/** 首次出现的章节：按章节号顺序找第一个包含该串的章 */
function firstSeen(needle) {
	for (const [ch, html] of chapterText) {
		if (html.includes(needle)) return ch;
	}
	return null;
}

const esc = (s) => String(s).replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, "&amp;");

const byCat = new Map();
for (const [term, cat, def, search] of TERMS) {
	if (!byCat.has(cat)) byCat.set(cat, []);
	byCat.get(cat).push([term, def, firstSeen(search ?? term)]);
}

let missing = 0;
let body = "";
for (const [cat, items] of byCat) {
	body += `<div class="part">
  <div class="part-head"><span class="no">${cat}</span><h2>&nbsp;</h2><span class="tag">${items.length} 条</span></div>
  <div class="tbl-scroll"><table><thead><tr><th>术语</th><th>中文解释</th><th>首见</th></tr></thead><tbody>
`;
	for (const [term, def, ch] of items) {
		if (!ch) missing++;
		const link = ch ? `<a href="chapters/${ch}.html">${ch.slice(2)}</a>` : "—";
		body += `<tr><td><code>${term}</code></td><td>${esc(def)}</td><td class="chs">${link}</td></tr>\n`;
	}
	body += `</tbody></table></div>\n</div>\n`;
}

writeFileSync(
	join(BOOK, "glossary.html"),
	`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>术语表 · Pi 源码解读手册</title>
<meta name="description" content="英文术语 → 中文解释 → 首次出现章节">
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Noto+Sans+SC:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<noscript><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Noto+Sans+SC:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"></noscript>
<link rel="stylesheet" href="assets/handbook.css">
<script src="assets/theme.js"></script>
</head>
<body>
<button class="theme-toggle" type="button" aria-label="切换深色/浅色模式" title="切换深色/浅色模式">
  <span class="sun" aria-hidden="true">☀️</span><span class="moon" aria-hidden="true">🌙</span>
</button>
<div class="wrap">
<nav class="crumb"><a href="index.html">← 目录</a> · <a href="sources.html">溯源索引</a> · <a href="drift.html">漂移记录</a></nav>

<header class="book-head">
  <div class="bars" aria-hidden="true"><span class="l1"></span><span class="l2"></span><span class="l3"></span><span class="l4 f"></span></div>
  <div class="kicker">Glossary</div>
  <h1>术语表<span class="zh">英文术语保留原文，不翻译</span></h1>
  <p class="lede">本书正文中代码、类型名、文件路径、专有名词一律保留英文（<code>AgentMessage</code> 不写成「智能体消息」）。此表给出中文解释与首次出现的章节。「首见」列由脚本扫描章节文件推导，非手写。</p>
  <div class="meta"><span>术语 <b>${TERMS.length}</b></span><span>分类 <b>${byCat.size}</b></span><span>锚定 <b><code>${SHORT}</code></b></span></div>
</header>

${body}
<div class="anchor-foot">
基于 <a href="https://github.com/earendil-works/pi/tree/${SHA}">earendil-works/pi @ <code>${SHORT}</code></a>（${stats.snapshot_date} 快照）。<br>
本页由 <code>tools/gen-glossary.mjs</code> 生成；术语收录靠人工判断，章节归属靠脚本推导。
</div>

</div>
</body>
</html>
`,
);

console.log(`✓ 生成 glossary.html（${TERMS.length} 条 / ${byCat.size} 类${missing ? ` · ⚠ ${missing} 条未在正文中找到` : ""}）`);
