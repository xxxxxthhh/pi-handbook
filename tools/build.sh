#!/usr/bin/env bash
# 完整构建 + 全部门禁。发布前跑这一条。
#
# 顺序有依赖：stats 先于生成页（页里的数字来自 stats.json），
# 生成页先于校验（校验要检查生成出来的页）。
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▸ 1/6  统计（程序化推导全部数字）"
tools/stats.sh > data/stats.json

echo "▸ 2/6  生成 index / sources / drift"
node tools/gen-aux.mjs

echo "▸ 3/6  生成 glossary"
node tools/gen-glossary.mjs

echo "▸ 4/6  站级校验（release 模式：死链视为错误）"
node tools/check-citations.mjs --release

echo "▸ 5/6  代码块核对（原文逐字 / 改写披露）"
node tools/check-literals.mjs

echo "▸ 6/6  校验器自检（mutation test）"
tools/mutate-test.sh > /dev/null && echo "  ✓ mutation test 全通过"

echo
echo "构建完成。人工审读点（QUALITY.md 第 5 条，脚本查不了）："
echo "  - ch08 / ch19 的实现状态判定"
echo "  - ch20 §2/§3/§4 的收录与分类取舍（本章是判断，不是事实）"
echo "  - drift.html 全表"
echo "  - 「改写自」块脚注的说明是否准确（GATE 5b 只查有无，不查真伪）"
