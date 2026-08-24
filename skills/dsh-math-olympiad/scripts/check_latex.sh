#!/usr/bin/env bash
# check_latex.sh — 检查机器上是否有可用的 TeX 引擎（脚本自写，MIT）。
#
# 用法: bash check_latex.sh
# 退出码:
#   0 = 至少一个引擎可用（pdflatex/xelatex/lualatex）
#   1 = 没有引擎（会打印各平台安装提示，供 SKILL 输出给用户）

set -u

engines=(pdflatex xelatex lualatex)
found=""

for e in "${engines[@]}"; do
  if command -v "$e" >/dev/null 2>&1; then
    found="$found $e"
  fi
done

if [ -z "$found" ]; then
  echo "check_latex: 未在 PATH 中找到可用的 TeX 引擎。" >&2
  echo "check_latex: 安装其一后重试（任选一种）：" >&2
  echo "  macOS      : brew install --cask mactex-no-gui   (或 mactex 全量包)" >&2
  echo "  Debian/Ubuntu: sudo apt-get install texlive-latex-extra" >&2
  echo "  Fedora     : sudo dnf install texlive-scheme-medium" >&2
  echo "  Arch       : sudo pacman -S texlive-langcjk texlive-latexextra" >&2
  echo "check_latex: 在装好之前，本技能会输出 Markdown 数学（\$...\$ 与 \$\$...\$\$），不影响解题流程。" >&2
  exit 1
fi

echo "check_latex: 找到可用引擎:$found"
exit 0