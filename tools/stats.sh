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

# ---------------------------------------------------------------- 锚点之后（不换锚点）
# 书的所有结论锚定在 $SHA。上游之后的变化只作「追记」，统计同样程序化：
# 读 UPSTREAM 提交上的文件（git show / git grep），不移动工作树 HEAD。
# 刷新追记：改下面这个 SHA → tools/build.sh；所有追记数字随之重算。
UPSTREAM="2b0a123de98318c2ff8069661721ce0c3794c34e"
if ! git cat-file -e "$UPSTREAM^{commit}" 2>/dev/null; then
  echo "FATAL: 上游追记提交 $UPSTREAM 不在本地仓库；先在 repo/ 里 git fetch origin" >&2
  exit 1
fi
UP_DATE="$(git log -1 --format=%ad --date=short "$UPSTREAM")"
UP_COMMITS_AFTER="$(git rev-list --count "$SHA..$UPSTREAM")"
UP_V2_PRESENT=0; git cat-file -e "$UPSTREAM:packages/agent/docs/harness-v2.md" 2>/dev/null && UP_V2_PRESENT=1
UP_SPEC_LINES="$(git show "$UPSTREAM:packages/agent/docs/harness.md" | wc -l | tr -d ' ')"
# 锚点上经 unavailable() 抛错的方法，逐个判定它们在上游的去向：
#   stubbed     = 上游仍以 SliceNotImplemented("<名字>") 抛错
#   implemented = 在 packages/agent/src/harness/ 下有方法定义，且不是上面的桩
#   removed     = packages/*/src 里已找不到这个标识符
UP_IMPL=0; UP_STUB=0; UP_REMOVED=0; UP_OTHER=0; UP_STUB_NAMES=""; UP_REMOVED_NAMES=""
for m in $(git show "$SHA:packages/agent/src/harness/agent-harness.ts" | grep -oE 'return this\.unavailable\("[A-Za-z]+' | sed 's/.*"//'); do
  if git grep -q "SliceNotImplemented(\"$m\")" "$UPSTREAM" -- 'packages/agent/src/harness'; then
    UP_STUB=$((UP_STUB+1)); UP_STUB_NAMES="$UP_STUB_NAMES $m"
  elif git grep -qE "^[[:space:]]+(async )?$m(<[^>]*>)?\(" "$UPSTREAM" -- 'packages/agent/src/harness'; then
    UP_IMPL=$((UP_IMPL+1))
  elif ! git grep -qw "$m" "$UPSTREAM" -- 'packages/*/src/*'; then
    UP_REMOVED=$((UP_REMOVED+1)); UP_REMOVED_NAMES="$UP_REMOVED_NAMES $m"
  else
    UP_OTHER=$((UP_OTHER+1))
  fi
done
if [ "$UP_OTHER" -ne 0 ]; then
  echo "FATAL: $UP_OTHER 个锚点抛错方法在上游既不是桩、也没有定义、也没删除——判定规则需要更新" >&2
  exit 1
fi
json_list() { local first=1; printf '['; for x in $1; do [ $first -eq 1 ] || printf ', '; first=0; printf '"%s"' "$x"; done; printf ']'; }
# 默认 CLI 是否仍走 new Agent：sdk.ts 里 new Agent( 的首个行号（0 = 已不存在）
UP_SDK_NEW_AGENT_LINE="$(git show "$UPSTREAM:packages/coding-agent/src/core/sdk.ts" | grep -n 'new Agent(' | head -1 | cut -d: -f1)"
UP_SDK_NEW_AGENT_LINE="${UP_SDK_NEW_AGENT_LINE:-0}"
# 三个关键变化各自落在哪个提交（短哈希 + 日期），供追记页面引用
commit_of() { git log "$1" --format='%h %ad' --date=short "$SHA..$UPSTREAM" -- "$2" | $3 -1; }
read -r UP_V2_GONE_C UP_V2_GONE_D <<< "$(commit_of --diff-filter=D packages/agent/docs/harness-v2.md head)"
read -r UP_UNAVAIL_C UP_UNAVAIL_D <<< "$(commit_of "-Sreturn this.unavailable(" packages/agent/src/harness/agent-harness.ts head)"
read -r UP_EXP_C UP_EXP_D <<< "$(commit_of --diff-filter=A packages/coding-agent/src/experimental tail)"
for v in "$UP_V2_GONE_C" "$UP_UNAVAIL_C" "$UP_EXP_C"; do
  [ -n "$v" ] || { echo "FATAL: 追记关键提交有一个没找到（判定命令需要更新）" >&2; exit 1; }
done
# 锚点时没有 src/experimental/；上游在这里新增了调用 durable harness 的 worker
UP_EXPERIMENTAL_AT_ANCHOR=0; git cat-file -e "$SHA:packages/coding-agent/src/experimental" 2>/dev/null && UP_EXPERIMENTAL_AT_ANCHOR=1

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
  },
  "after_anchor": {
    "upstream_sha": "$UPSTREAM",
    "upstream_sha_short": "$(git rev-parse --short=7 "$UPSTREAM")",
    "upstream_date": "$UP_DATE",
    "commits_after_anchor": $UP_COMMITS_AFTER,
    "harness_v2_md_present": $UP_V2_PRESENT,
    "harness_md_lines": $UP_SPEC_LINES,
    "anchor_unavailable_methods": {
      "implemented": $UP_IMPL,
      "removed": $UP_REMOVED,
      "stubbed": $UP_STUB,
      "removed_names": $(json_list "$UP_REMOVED_NAMES"),
      "stubbed_names": $(json_list "$UP_STUB_NAMES")
    },
    "commits": {
      "harness_v2_merged": {"sha": "$UP_V2_GONE_C", "date": "$UP_V2_GONE_D"},
      "unavailable_removed": {"sha": "$UP_UNAVAIL_C", "date": "$UP_UNAVAIL_D"},
      "experimental_added": {"sha": "$UP_EXP_C", "date": "$UP_EXP_D"}
    },
    "default_cli_new_agent_line": $UP_SDK_NEW_AGENT_LINE,
    "experimental_dir_at_anchor": $UP_EXPERIMENTAL_AT_ANCHOR
  }
}
EOF
