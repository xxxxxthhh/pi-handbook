#!/usr/bin/env bash
# Pi 源码解读手册 · 程序化统计
# 所有出现在页面上的数字都必须来自这里。禁止在 HTML 中手写统计量。
# 用法: tools/stats.sh > data/stats.json
set -euo pipefail

BOOK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${PI_REPO:-$BOOK_DIR/repo}"
SHA="ac4ac9eaf69f2b01ca3af984a5c48f3b99b84278"

cd "$REPO"

# 校验锚定 SHA 与工作树一致，否则所有行号引用失效
ACTUAL="$(git rev-parse HEAD)"
if [ "$ACTUAL" != "$SHA" ]; then
  echo "FATAL: repo HEAD is $ACTUAL, expected pinned $SHA" >&2
  exit 1
fi

loc() { # 某目录下 .ts/.tsx 的总行数（排除 node_modules 与生成文件）
  find "$1" \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/node_modules/*' \
    -print0 2>/dev/null | xargs -0 cat 2>/dev/null | wc -l | tr -d ' '
}

# packages/session-backends 是一个装子包的目录，没有自己的 package.json；
# 按目录统计，其 LOC 覆盖全部子包。
pkg_json() {
  local first=1
  for p in packages/*/; do
    name="$(basename "$p")"
    src_loc="$(loc "$p")"
    [ $first -eq 1 ] || printf ',\n'
    first=0
    printf '    {"name": "%s", "loc": %s}' "$name" "$src_loc"
  done
  printf '\n'
}

COMMITS="$(git rev-list --count HEAD)"
# 按署名（name）去重，不按 email——同一个人常有多个 email
AUTHORS="$(git shortlog -sn HEAD | wc -l | tr -d ' ')"
FIRST_DATE="$(git log --format=%ad --date=short HEAD | tail -1)"
HEAD_DATE="$(git log -1 --format=%ad --date=short HEAD)"
# 平均月提交速度：总提交 / 覆盖月数
MONTHS="$(git log --format=%ad --date=format:%Y-%m HEAD | sort -u | wc -l | tr -d ' ')"
PER_MONTH=$(( COMMITS / MONTHS ))

PACKAGES="$(ls -d packages/*/ | wc -l | tr -d ' ')"
# providers: <name>.ts 且存在同名 .models.ts 的才算一个真 provider
PROVIDERS="$(ls packages/ai/src/providers/*.models.ts 2>/dev/null | wc -l | tr -d ' ')"
BUILTIN_TOOLS="$(grep -rhoE '^\s+name: "[a-z]+",' packages/coding-agent/src/core/tools/*.ts | sort -u | wc -l | tr -d ' ')"
EXT_EVENTS="$(awk '/^export type ExtensionEvent =/,/^$/' packages/coding-agent/src/core/extensions/types.ts | grep -cE '^\s+\| [A-Z]')"
HOOK_NAMES="$(awk '/^export type HookName =/,/;$/' packages/agent/src/harness/agent-harness.ts | grep -cE '^\s+\| "')"
DOC_LINES="$(find . -name '*.md' -not -path './node_modules/*' -not -path './.git/*' -print0 | xargs -0 cat | wc -l | tr -d ' ')"
DOC_FILES="$(find . -name '*.md' -not -path './node_modules/*' -not -path './.git/*' | wc -l | tr -d ' ')"
HARNESS_V2_LINES="$(wc -l < packages/agent/docs/harness-v2.md | tr -d ' ')"
# harness-v2 落地度：AgentHarness 中经 unavailable() 抛 HarnessNotImplemented 的方法数
NOT_IMPL="$(grep -c 'return this.unavailable("' packages/agent/src/harness/agent-harness.ts)"
TOTAL_TS="$(loc packages)"

# 手册自身的计数（章节数由实际文件推导，禁止手写）
CHAPTERS="$(find "$BOOK_DIR/chapters" -name 'ch*.html' 2>/dev/null | wc -l | tr -d ' ')"

cat <<EOF
{
  "_generated_by": "tools/stats.sh",
  "repo": "earendil-works/pi",
  "sha": "$SHA",
  "sha_short": "$(git rev-parse --short=7 HEAD)",
  "snapshot_date": "$HEAD_DATE",
  "history": {
    "first_commit_date": "$FIRST_DATE",
    "commits": $COMMITS,
    "authors": $AUTHORS,
    "active_months": $MONTHS,
    "commits_per_month": $PER_MONTH
  },
  "code": {
    "packages": $PACKAGES,
    "total_ts_loc": $TOTAL_TS,
    "providers": $PROVIDERS,
    "builtin_tools": $BUILTIN_TOOLS,
    "extension_events": $EXT_EVENTS,
    "harness_hook_names": $HOOK_NAMES
  },
  "docs": {
    "markdown_files": $DOC_FILES,
    "markdown_lines": $DOC_LINES,
    "harness_v2_lines": $HARNESS_V2_LINES
  },
  "harness_v2": {
    "unimplemented_methods": $NOT_IMPL
  },
  "packages_detail": [
$(pkg_json)
  ],
  "book": {
    "chapters": $CHAPTERS
  }
}
EOF
