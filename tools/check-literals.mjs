#!/usr/bin/env node
/**
 * GATE 5 · 「原文」代码块必须逐字来自源文件
 *
 * 本书的前提是「我们读代码」，所以把改写过的块标成「原文」是唯一不可犯的错。
 * check-citations.mjs 结构上抓不到这类错误（它只看 a.src 锚点），而人工审读
 * 是「写在清单里但不会真跑」的那种检查——所以把它做成机器检查。
 *
 * 规则：标了 `class="lines literal"` 的 <pre><code> 里，每一行去掉首尾空白后
 * 必须在被引文件（@ 锚定 SHA）中逐字出现。允许的例外只有两类，且必须显式声明：
 *
 *   1. 块头标签里写明「注释为本书所加」→ 以 // 或 # 开头的行豁免
 *   2. 行内容为 `…`（省略标记）或空行
 *
 * 长行按显示宽度折行是允许的：折行后的每一段仍需是源文件某行的子串
 * （见下面的 SUBSTRING 兜底）。
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BOOK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = process.env.PI_REPO ?? join(BOOK, "repo");
const SHA = "ac4ac9eaf69f2b01ca3af984a5c48f3b99b84278";

/** 块头里出现这些词 → 该块不声称是源码，跳过 */
const NON_SOURCE = ["固定不变", "命令输出", "非源码"];

const fileCache = new Map();
function fileLines(path) {
	if (!fileCache.has(path)) {
		try {
			const blob = execFileSync("git", ["show", `${SHA}:${path}`], {
				cwd: REPO,
				encoding: "utf8",
				maxBuffer: 64 * 1024 * 1024,
			});
			fileCache.set(path, blob.split("\n"));
		} catch {
			fileCache.set(path, null);
		}
	}
	return fileCache.get(path);
}

const stripTags = (s) => s.replace(/<[^>]+>/g, "");
const unesc = (s) =>
	s
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&");

// .tpl 块：抓 head 的 path / lines 标签 + pre>code 内容（+ 可选的 tpl-foot）
const TPL_RE =
	/<div class="tpl">\s*<div class="tpl-head">(.*?)<\/div>\s*<pre><code>([\s\S]*?)<\/code><\/pre>\s*(?:<div class="tpl-foot">([\s\S]*?)<\/div>)?/g;
/** `改写自` 块必须在标签或脚注里说清改了什么 —— 否则「改写」二字等于没写 */
const DISCLOSURE = ["改写", "省略", "压缩", "非源码", "命令输出", "本书所加", "节录", "折行"];
const PATH_RE = /<span class="path">(.*?)<\/span>/;
const LINES_RE = /<span class="lines ([a-z]+)">(.*?)<\/span>/;

const errors = [];
const warnings = [];
let checked = 0;
let blocks = 0;
let rewritten = 0;

for (const file of readdirSync(join(BOOK, "chapters")).filter((f) => f.endsWith(".html")).sort()) {
	const html = readFileSync(join(BOOK, "chapters", file), "utf8");
	for (const m of html.matchAll(TPL_RE)) {
		const head = m[1];
		const kind = head.match(LINES_RE)?.[1];
		const label = stripTags(head.match(LINES_RE)?.[2] ?? "");

		// GATE 5b：改写块的披露义务。与 5a 同源——把「靠人记得」变成「不做就红」。
		if (kind === "rewritten") {
			rewritten++;
			// 「命令输出 / 非源码」类的块不声称对应任何源码行，标签本身已说清
			if (NON_SOURCE.some((w) => label.includes(w))) continue;
			// 其余必须在 tpl-foot 里说明改了什么。
			// 只看脚注：标签里必然含「改写」二字，拿它当证据等于没查。
			const foot = stripTags(m[3] ?? "");
			if (!DISCLOSURE.some((w) => foot.includes(w))) {
				errors.push(`${file} 「${label}」: 标了「改写」但 tpl-foot 没说明改了什么`);
			}
			continue;
		}
		if (kind !== "literal") continue;
		blocks++;
		if (NON_SOURCE.some((w) => label.includes(w))) continue;

		const pathLabel = stripTags(head.match(PATH_RE)?.[1] ?? "").trim();
		// 块头的 path 可能是缩写或描述（例如 "agent-loop.ts · 两处对照"）；
		// 用同章第一条 a.src 的完整路径做候选，再按后缀匹配。
		const candidates = [...html.matchAll(/blob\/[0-9a-f]{40}\/([^"#]+)#L/g)].map((x) => x[1]);
		const cleanPath = pathLabel.split("·")[0].trim().replace(/\s.*$/, "");
		const full =
			candidates.find((c) => c === cleanPath) ??
			candidates.find((c) => c.endsWith(`/${cleanPath}`)) ??
			candidates.find((c) => c.endsWith(cleanPath));
		// 本章无对应 a.src 时，若块头本身就是一个存在于该 SHA 的完整路径，直接用它
		const resolved = full ?? (fileLines(cleanPath) ? cleanPath : undefined);
		if (!resolved) {
			warnings.push(`${file}: 块头路径 "${pathLabel}" 无法对应到任何文件，跳过逐字核对`);
			continue;
		}

		const src = fileLines(resolved);
		if (!src) {
			errors.push(`${file}: ${resolved} 在该 SHA 下不存在`);
			continue;
		}
		const srcTrimmed = src.map((l) => l.trim());
		const allowBookComments = label.includes("注释为本书所加");

		for (const rawLine of m[2].split("\n")) {
			const line = unesc(stripTags(rawLine)).trim();
			if (!line || /^…+$/.test(line)) continue;
			if (allowBookComments && /^(\/\/|#)/.test(line)) continue;
			checked++;
			// `…` 是显式省略标记：按它切段，各段必须在<b>同一行</b>源码中按序出现。
			// 这允许「长行折行」与「中间省略」，但不允许改写——任何一个字变了都匹配不上。
			const parts = line.split("…").map((p) => p.trim()).filter(Boolean);
			const ok = srcTrimmed.some((s) => {
				let at = 0;
				for (const p of parts) {
					const i = s.indexOf(p, at);
					if (i < 0) return false;
					at = i + p.length;
				}
				return true;
			});
			if (!ok) {
				errors.push(
					`${file} 「${label}」→ ${resolved}\n      此行在源文件中不存在（标了「原文」但不是逐字）：\n      ${line.slice(0, 100)}`,
				);
			}
		}
	}
}

if (warnings.length) {
	console.warn(`⚠ ${warnings.length} 项无法自动核对：`);
	for (const w of warnings) console.warn(`  - ${w}`);
	console.warn("");
}
if (errors.length) {
	console.error(`✗ 「原文」块逐字核对失败：${errors.length} 处\n`);
	for (const e of errors) console.error(`  - ${e}`);
	process.exit(1);
}
console.log(`✓ 代码块核对通过 @ ${SHA.slice(0, 7)}：原文块 ${blocks} 个 / ${checked} 行逐字存在；改写块 ${rewritten} 个全部披露了改动`);
