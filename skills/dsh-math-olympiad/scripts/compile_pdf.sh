#!/usr/bin/env bash
# compile_pdf.sh — 把 LaTeX 文件编译成 PDF（脚本自写，MIT）。
#
# 用法: bash compile_pdf.sh <input.tex> [engine]
#   engine 可选: pdflatex | xelatex | lualatex（白名单限定）；缺省时按该顺序自动探测
# 退出码:
#   0 = 成功产出 PDF
#   1 = 没有可用引擎（会打印提示）
#   2 = 编译失败（有引擎但 LaTeX 报错 / 未产出 PDF）
#   3 = 用法错误（参数不对 / 输入文件不存在 / 不是 .tex / engine 不在白名单）

set -u

usage() {
  echo "usage: compile_pdf.sh <input.tex> [engine]" >&2
  echo "  engine: pdflatex | xelatex | lualatex（缺省自动探测）" >&2
}

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  usage
  exit 3
fi

input="$1"

if [ ! -f "$input" ]; then
  echo "compile_pdf: 输入文件不存在: $input" >&2
  exit 3
fi

case "$input" in
  *.tex) ;;
  *) echo "compile_pdf: 输入必须是 .tex 文件: $input" >&2; exit 3 ;;
esac

engine="${2:-}"

if [ -z "$engine" ]; then
  for cand in pdflatex xelatex lualatex; do
    if command -v "$cand" >/dev/null 2>&1; then
      engine="$cand"
      break
    fi
  done
fi

if [ -z "$engine" ]; then
  echo "compile_pdf: 找不到 TeX 引擎（自动探测 pdflatex/xelatex/lualatex 均无），无法编译。" >&2
  echo "compile_pdf: 先运行 skills/dsh-math-olympiad/scripts/check_latex.sh 获取安装提示。" >&2
  echo "compile_pdf: 或改用 Markdown 数学输出（\$...\$ / \$\$...\$\$），流程不受影响。" >&2
  exit 1
fi

# 引擎白名单：只允许受支持的 TeX 引擎，避免任意 PATH 可执行文件被当作引擎执行。
case "$engine" in
  pdflatex|xelatex|lualatex) ;;
  *) echo "compile_pdf: 不支持的引擎: ${engine}（仅支持 pdflatex | xelatex | lualatex）" >&2
     usage
     exit 3 ;;
esac

if ! command -v "$engine" >/dev/null 2>&1; then
  echo "compile_pdf: 引擎 $engine 不在 PATH 中，无法编译。" >&2
  echo "compile_pdf: 先运行 skills/dsh-math-olympiad/scripts/check_latex.sh 获取安装提示。" >&2
  echo "compile_pdf: 或改用 Markdown 数学输出（\$...\$ / \$\$...\$\$），流程不受影响。" >&2
  exit 1
fi

dir=$(dirname "$input")
base=$(basename "$input" .tex)

if ! cd "$dir" 2>/dev/null; then
  echo "compile_pdf: 无法进入目录: $dir" >&2
  exit 3
fi

# 两遍编译以解析交叉引用；非交互 + 遇错即停，第一遍失败立即报告。
"$engine" -interaction=nonstopmode -halt-on-error "$base.tex" >/dev/null 2>&1
status=$?
if [ $status -ne 0 ]; then
  echo "compile_pdf: $engine 第一遍编译失败（退出码 ${status}）；" >&2
  echo "compile_pdf: 不带输出重定向手动重跑以查看错误日志:" >&2
  echo "  cd \"$dir\" && $engine -interaction=nonstopmode -halt-on-error \"$base.tex\"" >&2
  exit 2
fi

"$engine" -interaction=nonstopmode -halt-on-error "$base.tex" >/dev/null 2>&1
status=$?
if [ $status -ne 0 ]; then
  echo "compile_pdf: $engine 第二遍编译失败（退出码 ${status}）。" >&2
  exit 2
fi

if [ ! -f "$base.pdf" ]; then
  echo "compile_pdf: $engine 运行结束但未产出 ${base}.pdf。" >&2
  exit 2
fi

echo "compile_pdf: 已生成 $dir/$base.pdf"
exit 0