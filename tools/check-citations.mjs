#!/usr/bin/env node
/**
 * 站级校验器：引用可解析 + 实现状态可证 + 漂移双向举证 + 内部死链
 *
 * QUALITY.md 第 3 条：自产校验器最容易只验形式不验实质（典型反例是检查「有没有来源标注」
 * 而不是「来源是否可抵达」）。因此本校验器的每一项都要求实质证据：
 *
 *   GATE 1 引用可解析 —— HTML 中每个 <a class="src">：
 *     · URL 的 sha == 锚定 SHA
 *     · git show <SHA>:<path> 能取到文件，行号在范围内
 *     · 锚文本 "path:line" 与 URL 的 path/line 一致
 *     · 【实质】该行实际内容包含 data-expect 指定的子串（data-expect 必填）
 *
 *   GATE 1b 锚点后追记可解析 —— HTML 中每个 <a class="src-up">：
 *     · URL 的 sha == data/stats.json 的 after_anchor.upstream_sha（追记提交，不是锚定 SHA）
 *     · 其余与 GATE 1 相同：文件存在、行号在范围内、锚文本一致、该行包含 data-expect
 *
 *   GATE 2 实现状态可证 —— 每个带 .status 徽章的章节：
 *     · data/status.json 中有对应条目，且徽章文案与之一致
 *     · 条目里每条 evidence 的 path:line:expect 同样按 GATE 1 的方式解析
 *
 *   GATE 3 漂移双向举证 —— data/drift.json 每条：
 *     · doc_side 与 code_side 都存在，且各自的 path:line:expect 可解析
 *
 *   GATE 1c 第一方表述的发表间隔 —— 「锚定 SHA 之后 N 天」必须等于同段发表日期 − snapshot_date
 *   GATE 4 内部死链 —— HTML 中所有相对 href 指向的本地文件必须存在
 *
 * data-expect / expect 是唯一能挡住「行号漂移」的检查，因此一律必填。
 * mutation test: tools/mutate-test.sh
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BOOK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = process.env.PI_REPO ?? join(BOOK, "repo");
const PINNED = "ac4ac9eaf69f2b01ca3af984a5c48f3b99b84278";
// 锚点之后的追记只引用这一个上游提交；它由 tools/stats.sh 写进 stats.json，这里不重复写死。
const statsPath = join(BOOK, "data", "stats.json");
const UPSTREAM = existsSync(statsPath)
	? JSON.parse(readFileSync(statsPath, "utf8")).after_anchor?.upstream_sha
	: undefined;

const SRC_RE =
	/<a\s+class="src"\s+href="https:\/\/github\.com\/earendil-works\/pi\/blob\/([0-9a-f]{40})\/([^"#]+)#L(\d+)"([^>]*)>([^<]+)<\/a>/g;
const SRC_UP_RE =
	/<a\s+class="src-up"\s+href="https:\/\/github\.com\/earendil-works\/pi\/blob\/([0-9a-f]{40})\/([^"#]+)#L(\d+)"([^>]*)>([^<]+)<\/a>/g;
const STATUS_RE = /<span class="status (shipped|partial|paper)">([^<]+)<\/span>/g;
const HREF_RE = /\shref="(?!https?:|mailto:|#)([^"]+)"/g;

const STATUS_TEXT = { shipped: "已发布", partial: "部分落地", paper: "仅设计文档" };

// GATE 1c：第一方公开表述（裸 href）写「锚定 SHA 之后 N 天 / 比 <sha> 晚 N 天」时，
// N 必须等于该段里写明的发表日期减去 stats.json 的 snapshot_date。手写天数在锚定 SHA
// 变更时会四处同时失效，这里把它变成可推导的不变量。
const SNAPSHOT_DATE = existsSync(statsPath)
	? JSON.parse(readFileSync(statsPath, "utf8")).snapshot_date
	: undefined;
const GAP_RE = /(?:锚定 SHA 之后|晚)\s*(?:<b>)?\s*(\d+)\s*(?:<\/b>)?\s*天/g;
const DATE_IN_PAREN_RE = /[（(](\d{4}-\d{2}-\d{2})[）)]/;
const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

// 建设期章节尚未全部产出，交叉引用必然暂时打不开。死链默认降级为 warning，
// 发布前用 --release 提升为 error（CLAUDE.md 校验器 #4 的横切检查）。
const RELEASE = process.argv.includes("--release");

const errors = [];
const warnings = [];
const counts = { citations: 0, upstream: 0, status: 0, drift: 0, links: 0, gaps: 0 };

const fileCache = new Map();
function linesAt(path, sha = PINNED) {
	const key = `${sha}:${path}`;
	if (!fileCache.has(key)) {
		try {
			const blob = execFileSync("git", ["show", `${sha}:${path}`], {
				cwd: REPO,
				encoding: "utf8",
				maxBuffer: 64 * 1024 * 1024,
			});
			fileCache.set(key, blob.split("\n"));
		} catch {
			fileCache.set(key, null);
		}
	}
	return fileCache.get(key);
}

const unescape = (s) =>
	s
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&");

/** 共用的实质检查：<path> 在锚定 SHA 的第 <line> 行是否包含 <expect> */
function verifyAnchor(where, path, line, expect, sha = PINNED) {
	const lines = linesAt(path, sha);
	if (lines === null) return errors.push(`${where}: 该 SHA 下不存在文件 ${path}`);
	if (line < 1 || line > lines.length)
		return errors.push(`${where}: 行号 ${line} 越界（${path} 共 ${lines.length} 行）`);
	if (expect === undefined || expect === "")
		return errors.push(`${where}: 缺 expect —— 没有实质检查的引用不作数`);
	const actual = lines[line - 1];
	if (!actual.includes(expect))
		errors.push(
			`${where}: ${path}:${line} 实际内容不含期望片段\n      期望: ${expect}\n      实际: ${actual.trim().slice(0, 100)}`,
		);
}

function htmlFiles(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		if (name === "repo" || name === "node_modules" || name.startsWith(".")) continue;
		const full = join(dir, name);
		if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
		else if (name.endsWith(".html")) out.push(full);
	}
	return out;
}

// 锚文本形如 "packages/agent/src/agent-loop.ts:582" 或 "agent-loop.ts:582–584"。
// 允许缩写路径（只写文件名），但行号必须与 URL 首行一致。
function checkAnchorText(text, path, line) {
	const m = text.match(/^(.+?):(\d+)(?:[–\-]\d+)?$/);
	if (!m) return `锚文本 "${text}" 不是 path:line 形式`;
	const [, anchorPath, anchorLine] = m;
	if (Number(anchorLine) !== line) return `锚文本行号 ${anchorLine} ≠ URL 行号 ${line}`;
	if (!path.endsWith(anchorPath)) return `锚文本路径 "${anchorPath}" 不是 URL 路径 "${path}" 的后缀`;
	return null;
}

// ---------------------------------------------------------------- GATE 1 + 2 + 4
const statusJsonPath = join(BOOK, "data", "status.json");
const status = existsSync(statusJsonPath) ? JSON.parse(readFileSync(statusJsonPath, "utf8")) : null;
if (!status) errors.push("data/status.json 不存在 —— GATE 2 无法执行");

for (const file of htmlFiles(BOOK)) {
	const html = readFileSync(file, "utf8");
	const rel = file.slice(BOOK.length + 1);
	const chapter = rel.match(/chapters\/(ch\d+)\.html$/)?.[1];

	// GATE 1
	for (const m of html.matchAll(SRC_RE)) {
		counts.citations++;
		const [, sha, path, lineStr, attrs, text] = m;
		const line = Number(lineStr);
		const where = `${rel} → ${path}:${line}`;
		if (sha !== PINNED) {
			errors.push(`${where}: SHA ${sha.slice(0, 7)} ≠ 锚定 ${PINNED.slice(0, 7)}`);
			continue;
		}
		const anchorErr = checkAnchorText(text.trim(), path, line);
		if (anchorErr) errors.push(`${where}: ${anchorErr}`);
		const expectMatch = attrs.match(/data-expect="([^"]*)"/);
		verifyAnchor(where, path, line, expectMatch ? unescape(expectMatch[1]) : undefined);
	}

	// GATE 1b
	for (const m of html.matchAll(SRC_UP_RE)) {
		counts.upstream++;
		const [, sha, path, lineStr, attrs, text] = m;
		const line = Number(lineStr);
		const where = `${rel} → ${path}:${line} @追记`;
		if (!UPSTREAM) {
			errors.push(`${where}: stats.json 缺 after_anchor.upstream_sha —— GATE 1b 无法执行`);
			continue;
		}
		if (sha !== UPSTREAM) {
			errors.push(`${where}: SHA ${sha.slice(0, 7)} ≠ 追记提交 ${UPSTREAM.slice(0, 7)}`);
			continue;
		}
		const anchorErr = checkAnchorText(text.trim(), path, line);
		if (anchorErr) errors.push(`${where}: ${anchorErr}`);
		const expectMatch = attrs.match(/data-expect="([^"]*)"/);
		verifyAnchor(where, path, line, expectMatch ? unescape(expectMatch[1]) : undefined, sha);
	}

	// GATE 2
	// 只有 <header class="ch"> 内的那个徽章代表本章状态；正文里的徽章是行文中
	// 指代别的构件（例：ch08 §4 说「session 存储是[已发布]」），不该被当成章节裁决。
	// 两者都校验 class↔文案一致性，但只有 header 里的与 status.json 比对。
	const headerHtml = html.match(/<header class="ch">[\s\S]*?<\/header>/)?.[0] ?? "";
	for (const m of html.matchAll(STATUS_RE)) {
		counts.status++;
		const [, cls, label] = m;
		const where = `${rel} 状态徽章`;
		if (STATUS_TEXT[cls] !== label.trim())
			errors.push(`${where}: class "${cls}" 与文案「${label.trim()}」不符`);
		if (!chapter || !headerHtml.includes(m[0])) continue;
		const entry = status?.[chapter];
		if (!entry) {
			errors.push(`${where}: data/status.json 缺 ${chapter} 条目`);
			continue;
		}
		if (entry.status !== label.trim())
			errors.push(`${where}: 页面标「${label.trim()}」，status.json 标「${entry.status}」`);
		if (!Array.isArray(entry.evidence) || entry.evidence.length === 0)
			errors.push(`${where}: ${chapter} 条目没有 evidence`);
		for (const ev of entry.evidence ?? [])
			verifyAnchor(`status.json/${chapter}`, ev.path, ev.line, ev.expect);
	}

	// GATE 1c
	for (const block of html.split(/<\/(?:p|li)>/)) {
		for (const g of block.matchAll(GAP_RE)) {
			counts.gaps++;
			const d = block.match(DATE_IN_PAREN_RE);
			if (!SNAPSHOT_DATE) errors.push(`${rel}: stats.json 缺 snapshot_date —— GATE 1c 无法执行`);
			else if (!d) errors.push(`${rel}: 写了「${g[1]} 天」但同一段没有 （YYYY-MM-DD） 发表日期可供推导`);
			else if (dayDiff(d[1], SNAPSHOT_DATE) !== Number(g[1]))
				errors.push(`${rel}: 「${g[1]} 天」与 ${d[1]} − 锚定日 ${SNAPSHOT_DATE} = ${dayDiff(d[1], SNAPSHOT_DATE)} 天不符`);
		}
	}

	// GATE 4
	for (const m of html.matchAll(HREF_RE)) {
		counts.links++;
		const target = m[1].split("#")[0];
		if (!target) continue;
		const abs = resolve(dirname(file), target);
		if (!existsSync(abs)) (RELEASE ? errors : warnings).push(`${rel}: 死链 → ${m[1]}`);
	}
}

// GATE 2b：反向——status.json 里不该有没人认领的条目。
// 只查页面→json 会让孤儿条目静默留存（它们的证据没人核对，等于死代码）。
if (status) {
	const claimed = new Set();
	for (const file of htmlFiles(BOOK)) {
		const ch = file.slice(BOOK.length + 1).match(/chapters\/(ch\d+)\.html$/)?.[1];
		if (!ch) continue;
		const header = readFileSync(file, "utf8").match(/<header class="ch">[\s\S]*?<\/header>/)?.[0] ?? "";
		if (/<span class="status /.test(header)) claimed.add(ch);
	}
	for (const key of Object.keys(status)) {
		if (key.startsWith("_")) continue;
		if (!claimed.has(key)) errors.push(`data/status.json: ${key} 是孤儿条目（该章页面没有状态徽章）`);
	}
}

// ---------------------------------------------------------------- GATE 6
// 章节自测覆盖：SKELETON §5 要求正文章节（ch01–ch19）各有 ≥2 道场景自测，
// 且 data-answer 必须与答案解释开头的加粗字母一致。ch00（导读）/ ch20（评价）豁免。
{
	const QA_RE = /<div class="q" data-answer="([a-c])">([\s\S]*?)<\/details>/g;
	const BOLD_RE = /<div class="answer">\s*<p><b>([A-C])[。.]/;
	for (const file of htmlFiles(BOOK)) {
		const ch = file.slice(BOOK.length + 1).match(/chapters\/ch(\d+)\.html$/)?.[1];
		if (!ch || ch === "00" || ch === "20") continue;
		const html = readFileSync(file, "utf8");
		let n = 0;
		for (const m of html.matchAll(QA_RE)) {
			n++;
			counts.quiz = (counts.quiz ?? 0) + 1;
			const b = m[2].match(BOLD_RE);
			if (!b) errors.push(`chapters/ch${ch}.html 第 ${n} 题: 答案解释未以「<b>X。</b>」开头`);
			else if (b[1] !== m[1].toUpperCase())
				errors.push(`chapters/ch${ch}.html 第 ${n} 题: data-answer=${m[1].toUpperCase()} 但解释说 ${b[1]}`);
		}
		if (n < 2) errors.push(`chapters/ch${ch}.html: 自测题 ${n} 道，SKELETON §5 要求 ≥2`);
	}
}

// ---------------------------------------------------------------- GATE 3
const driftJsonPath = join(BOOK, "data", "drift.json");
if (existsSync(driftJsonPath)) {
	const drift = JSON.parse(readFileSync(driftJsonPath, "utf8"));
	for (const e of drift.entries ?? []) {
		counts.drift++;
		for (const side of ["doc_side", "code_side"]) {
			const s = e[side];
			if (!s) {
				errors.push(`drift.json/${e.id}: 缺 ${side} —— 单侧举证的条目不予收录`);
				continue;
			}
			verifyAnchor(`drift.json/${e.id}/${side}`, s.path, s.line, s.expect);
		}
	}
}

// ----------------------------------------------------------------------- 结果
if (warnings.length > 0) {
	console.warn(`⚠ ${warnings.length} 项警告（建设期允许；发布前跑 --release 必须清零）`);
	for (const w of warnings) console.warn(`  - ${w}`);
	console.warn("");
}
if (errors.length > 0) {
	console.error(`✗ 站级校验失败：${errors.length} 项\n`);
	for (const e of errors) console.error(`  - ${e}`);
	process.exit(1);
}
console.log(
	`✓ 站级校验通过 @ ${PINNED.slice(0, 7)}${RELEASE ? "（release 模式）" : ""}\n` +
		`  引用 ${counts.citations} 条 · 追记引用 ${counts.upstream} 条 @${(UPSTREAM ?? "").slice(0, 7)} · 状态徽章 ${counts.status} 个 · 自测 ${counts.quiz ?? 0} 道 · 漂移 ${counts.drift} 条 · 发表间隔 ${counts.gaps} 处 · 内部链接 ${counts.links} 个`,
);
