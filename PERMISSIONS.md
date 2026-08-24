# PERMISSIONS — dsh-math-olympiad 权限与失败边界声明

本文件供 DSH STORE 自动审查与人工复核使用，如实描述插件在运行时
做什么、不做什么，以及失败边界。

## 运行时行为
- **目的**：竞赛数学解题技能包（IMO/Putnam/USAMO/AIME）：纯推理求解 + 新鲜上下文 subagent 对抗验证 + 校准信心输出（high/medium/诚实「无把握解」）。
- **读取**：本包自带 `skills/` 技能目录（frontmatter/定义）；使用 `customSkillDirs` 隔离，只扫本包技能根。
- **写入**：无默认写面；仅当用户显式请求 LaTeX→PDF 时在输出目录写 `*.pdf`。
- **命令执行**（可选，非 shell 固定 argv）：
  - `bash <pkg>/skills/dsh-math-olympiad/scripts/check_latex.sh`：TeX 引擎探测（无引擎返回清晰提示）；
  - `bash <pkg>/skills/dsh-math-olympiad/scripts/compile_pdf.sh <tex>`：LaTeX → PDF（仅显式请求时）。
- **网络**：无。求解/验证全程本地（subagent 由宿主提供）。
- **凭据/密钥**：不读取、不写、不转发。
- **外部服务**：无。
- **全局资源**：不安装全局包。

## 依赖
| 依赖 | 用途 | 提供方 |
|---|---|---|
| Node.js ≥ 22.18 | 插件加载 | DSH 宿主 |
| @deepseek-ai/cordis / dsh-skill-filesystem | DSH 宿主提供的运行时服务（peer） | DSH 宿主 |
| TeX（可选） | LaTeX→PDF 渲染 | 主机预装/系统包 |

## 文件权限信号说明
- 运行时**不**执行 `chmod`/`chown`；PDF 输出以宿主默认权限创建。
- 不依赖可执行位（脚本以 `bash <path>` 显式调用）；仓库文件均以 644 提交（scripts 为可执行仅本地开发，提交模式见 git）；无 setuid/setgid/sticky 信号。

## 失败边界（结构化，绝不静默）
- 无 TeX 引擎时 `check_latex.sh` 返回非 0 并提供安装提示，测试显式跳过而非假绿。
- 对抗验证失败 → 输出诚实「无把握解」（不硬编答案）。
- 技能 provider 隔离：只扫 `customSkillDirs`，避免重复候选。
