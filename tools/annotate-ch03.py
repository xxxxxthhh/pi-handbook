#!/usr/bin/env python3
"""一次性脚本：给 ch03 的引用补 data-expect，并修正两处错误行号。
样章定稿后即可删除；后续章节直接按体例手写 data-expect。"""
import re, sys, pathlib

BOOK = pathlib.Path(__file__).resolve().parent.parent
f = BOOK / "chapters" / "ch03.html"
html = f.read_text(encoding="utf-8")

SHA = "ac4ac9eaf69f2b01ca3af984a5c48f3b99b84278"
BASE = f"https://github.com/earendil-works/pi/blob/{SHA}/"

# (旧 path#L行, 新 path#L行, 新锚文本, data-expect)
FIX = [
    ("packages/agent/src/agent-loop.ts#L155", "packages/agent/src/agent-loop.ts#L155",
     "packages/agent/src/agent-loop.ts:155", "async function runLoop("),
    ("packages/agent/src/agent-loop.ts#L167", "packages/agent/src/agent-loop.ts#L167",
     "agent-loop.ts:167", "getSteeringMessages"),
    # 原引用指向注释块首行 /**，无实质内容；改指「salvage parser」那一句
    ("packages/agent/src/agent-loop.ts#L374", "packages/agent/src/agent-loop.ts#L376",
     "agent-loop.ts:376", "best-effort JSON salvage parser"),
    ("packages/agent/src/agent-loop.ts#L396", "packages/agent/src/agent-loop.ts#L396",
     "agent-loop.ts:396", "was not executed"),
    ("packages/agent/src/agent-loop.ts#L582", "packages/agent/src/agent-loop.ts#L582",
     "agent-loop.ts:582–584", "function shouldTerminateToolBatch"),
    # 原引用指向裸 if(；改指钩子调用那一行
    ("packages/agent/src/agent-loop.ts#L247", "packages/agent/src/agent-loop.ts#L248",
     "agent-loop.ts:248–257", "config.shouldStopAfterTurn?."),
    ("packages/agent/src/agent-loop.ts#L64", "packages/agent/src/agent-loop.ts#L64",
     "agent-loop.ts:64–76", "export function agentLoopContinue("),
    ("packages/agent/src/agent-loop.ts#L104", "packages/agent/src/agent-loop.ts#L104",
     "agent-loop.ts:104–107", "const currentContext: AgentContext = {"),
    ("packages/agent/src/agent-loop.ts#L136", "packages/agent/src/agent-loop.ts#L136",
     "agent-loop.ts:136", "{ ...context }"),
    ("packages/agent/src/agent-loop.ts#L196", "packages/agent/src/agent-loop.ts#L196",
     "agent-loop.ts:196–200", 'stopReason === "error"'),
    ("packages/agent/src/agent-loop.ts#L259", "packages/agent/src/agent-loop.ts#L259",
     "agent-loop.ts:259", "pendingMessages = (await config.getSteeringMessages"),
    ("packages/agent/src/agent-loop.ts#L540", "packages/agent/src/agent-loop.ts#L540",
     "agent-loop.ts:540–548", "orderedFinalizedCalls"),
    # createContextSnapshot 声明在 437，不是 435
    ("packages/agent/src/agent.ts#L435", "packages/agent/src/agent.ts#L437",
     "agent.ts:437–443", "private createContextSnapshot(): AgentContext {"),
    ("packages/agent/src/agent.ts#L588", "packages/agent/src/agent.ts#L588",
     "agent.ts:588–590", "for (const listener of this.listeners) {"),
    ("packages/ai/src/utils/event-stream.ts#L21", "packages/ai/src/utils/event-stream.ts#L21",
     "event-stream.ts:21", "push(event: T): void {"),
    ("packages/coding-agent/src/core/extensions/types.ts#L397",
     "packages/coding-agent/src/core/extensions/types.ts#L397",
     "extensions/types.ts:397", "deliverAs"),
    ("CONTRIBUTING.md#L11", "CONTRIBUTING.md#L11",
     "CONTRIBUTING.md:11", "hook points for extensions"),
]

def esc(s):
    return (s.replace("&", "&amp;").replace('"', "&quot;")
             .replace("<", "&lt;").replace(">", "&gt;"))

count = 0
for old_ref, new_ref, anchor, expect in FIX:
    pattern = re.compile(
        r'<a class="src" href="' + re.escape(BASE + old_ref) + r'">[^<]+</a>')
    repl = (f'<a class="src" href="{BASE}{new_ref}" '
            f'data-expect="{esc(expect)}">{anchor}</a>')
    html, n = pattern.subn(repl, html)
    if n == 0:
        print(f"WARN: 未匹配 {old_ref}", file=sys.stderr)
    count += n

f.write_text(html, encoding="utf-8")
print(f"改写 {count} 条引用")
