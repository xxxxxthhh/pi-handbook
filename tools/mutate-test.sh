#!/usr/bin/env bash
# 对 check-citations.mjs 的四道 GATE 做 mutation test。
#
# QUALITY.md 第 3 条：没做过 mutation test 的门禁，其「0 错误」不作数。
# 每加一道 GATE，必须同时在这里加一条对应的注入，否则新 GATE 视为未验证。
set -uo pipefail

cd "$(dirname "$0")/.."

FILES=(chapters/ch03.html chapters/ch04.html chapters/ch08.html data/status.json data/drift.json)
TMP="$(mktemp -d)"
for f in "${FILES[@]}"; do mkdir -p "$TMP/$(dirname "$f")"; cp "$f" "$TMP/$f"; done
restore() { for f in "${FILES[@]}"; do cp "$TMP/$f" "$f"; done; rm -rf "$TMP"; }
trap restore EXIT

pass=0; fail=0

# BSD 与 GNU 的 sed -i 语法不同；CI 跑在 ubuntu 上，本地是 macOS
sedi() { if sed --version >/dev/null 2>&1; then sed -i "$1" "$2"; else sed -i '' "$1" "$2"; fi }

expect_red() { # $1=描述  $2=目标文件  $3=sed 表达式
  restore_files() { for f in "${FILES[@]}"; do cp "$TMP/$f" "$f"; done; }
  restore_files
  sedi "$3" "$2"
  # --release 让死链也算 error，确保 GATE 4 的注入能被判定
  if node tools/check-citations.mjs --release >/dev/null 2>&1; then
    echo "  ✗ FAIL: $1 —— 校验器没抓到"
    fail=$((fail+1))
  else
    echo "  ✓ pass: $1"
    pass=$((pass+1))
  fi
}

echo "mutation test: tools/check-citations.mjs"
echo
echo "GATE 1 · 引用可解析"
# 行号漂移 ±5：最常见的失效方式（上游改了文件，行号不再对应）
expect_red "行号 +5（582 → 587）"      chapters/ch03.html 's|agent-loop\.ts#L582|agent-loop.ts#L587|'
expect_red "锚文本行号与 URL 不符"      chapters/ch03.html 's|>agent-loop\.ts:167<|>agent-loop.ts:999<|'
expect_red "移除 data-expect"           chapters/ch03.html 's| data-expect="async function runLoop("||'
expect_red "SHA 非锚定版本"             chapters/ch03.html 's|/blob/ac4ac9eaf69f2b01ca3af984a5c48f3b99b84278/packages/ai|/blob/0000000000000000000000000000000000000000/packages/ai|'
expect_red "文件在该 SHA 下不存在"      chapters/ch03.html 's|packages/ai/src/utils/event-stream\.ts|packages/ai/src/utils/does-not-exist.ts|'

echo
echo "GATE 1b · 锚点后追记可解析"
expect_red "追记引用行号 +5（306 → 311）" chapters/ch08.html 's|runtime/harness\.ts#L306|runtime/harness.ts#L311|'
expect_red "追记引用改用锚定 SHA"        chapters/ch08.html 's|/blob/2b0a123de98318c2ff8069661721ce0c3794c34e/packages/coding-agent/src/core/sdk\.ts|/blob/ac4ac9eaf69f2b01ca3af984a5c48f3b99b84278/packages/coding-agent/src/core/sdk.ts|'
expect_red "移除追记 data-expect"        chapters/ch08.html 's| data-expect="async resume("||'
echo
echo "GATE 2 · 实现状态可证"
expect_red "status.json 证据行号漂移"   data/status.json   's|"line": 294|"line": 299|'
expect_red "页面徽章与 status.json 不符" data/status.json  's|"status": "已发布"|"status": "部分落地"|'
expect_red "徽章 class 与文案不符"       chapters/ch03.html 's|class="status shipped">已发布|class="status shipped">部分落地|'

echo
echo "GATE 3 · 漂移双向举证"
expect_red "drift 条目缺 code_side"      data/drift.json    's|"code_side"|"code_side_REMOVED"|'
expect_red "drift 证据行号漂移"          data/drift.json    's|"line": 136|"line": 140|'

echo
echo "GATE 4 · 内部死链（--release）"
expect_red "指向不存在的本地文件"        chapters/ch03.html 's|href="../assets/handbook.css"|href="../assets/nope.css"|'

echo
echo "GATE 6 · 自测覆盖与答案一致性"
expect_red "quiz 答案与解释不一致"       chapters/ch03.html 's|<div class="q" data-answer="b">|<div class="q" data-answer="a">|'
expect_red "整章 quiz 被删到 1 道以下"   chapters/ch04.html 's|<div class="q" data-answer|<div class="q-disabled" data-answer|g'

echo
echo "GATE 5 ·「原文」块逐字核对"
# 这道门禁跑的是另一个脚本，单独判定
gate5_red() { # $1=描述  $2=目标文件  $3=sed 表达式
  for f in "${FILES[@]}"; do cp "$TMP/$f" "$f"; done
  sedi "$3" "$2"
  if node tools/check-literals.mjs >/dev/null 2>&1; then
    echo "  ✗ FAIL: $1 —— 校验器没抓到"; fail=$((fail+1))
  else
    echo "  ✓ pass: $1"; pass=$((pass+1))
  fi
}
# 改一个字：标着「原文」的块从此不再逐字
gate5_red "原文块被改了一个标识符"      chapters/ch03.html 's|finalizedCalls.every((finalized)|finalizedCalls.every((f)|'
gate5_red "原文块被插入了源码中没有的行" chapters/ch03.html 's|^}</code></pre>|    // 本书补充的说明\n}</code></pre>|'
# 5b：改写块必须说明改了什么
gate5_red "改写块的脚注没说明改了什么"   chapters/ch04.html 's|<b>这是改写</b>：省略了变量的完整类型标注与箭头函数体的换行。|无关说明。|'

echo
# 干净树必须变绿——否则上面的「变红」可能只是校验器一直红
for f in "${FILES[@]}"; do cp "$TMP/$f" "$f"; done
if node tools/check-citations.mjs >/dev/null 2>&1; then
  echo "  ✓ pass: 干净树通过（非 release 模式）"
  pass=$((pass+1))
else
  echo "  ✗ FAIL: 干净树竟然不通过"
  fail=$((fail+1))
fi

echo
echo "结果: $pass 通过 / $fail 失败"
[ "$fail" -eq 0 ]
