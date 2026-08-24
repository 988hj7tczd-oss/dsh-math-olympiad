---
name: dsh-math-olympiad
description: >
  Solve or verify IMO / Putnam / USAMO / AIME and other competition-math
  problems with a rigorous two-phase protocol: a pure-reasoning solution
  first, then an adversarial verifier that runs in a FRESH subagent context
  against only the stripped proof body (no reasoning chain leaked), attacking
  concrete failure modes and known open-problem traps before any confidence is
  declared; output calibrated confidence (high / medium / honest "no confident
  solution") and render LaTeX to PDF when a TeX engine is available. Triggers
  on "solve this IMO problem", "prove this olympiad inequality", "verify this
  competition proof", "find a counterexample", "is this proof correct", and on
  any request containing IMO / Putnam / USAMO / competition math / olympiad /
  数学竞赛 / 竞赛数学 / 奥林匹克 / 竞赛不等式 / 竞赛数论 / 竞赛几何 /
  竞赛组合 / 证明校验 / 证明是否正确 / 找一个反例.
version: 0.1.0
---

# 竞赛数学解题：对抗验证 + 校准信心

## 定位与边界

本技能用于 IMO / Putnam / USAMO / AIME 与各类数学竞赛题的分步求解与证明校验。
核心不是"解得多快"，而是两条纪律：

1. **对抗验证**：解完之后，剥离思考链，只把干净的证明正文交给**新鲜上下文的
   subagent 验证器**，用具体失败模式逐一攻击，而不是泛泛"检查一下逻辑"。
2. **诚实弃权**：信心是**校准过**的（high / medium），不确定就直说
   "no confident solution"，绝不为了显得有用而硬编一个答案。

**不承诺正确率。** 本技能的价值在流程严谨与弃权诚实，不在正确率担保；
输出永远以"解 + 验证结论 + 信心"三位一体呈现，供你自行判断。

## 触发条件

对话中出现以下任一情形即触发（与 frontmatter 一致）：

- 用户明确说：`solve this IMO problem`、`prove this olympiad inequality`、
  `verify this competition proof`、`find a counterexample`、
  `is this proof correct`；
- 文本含 `IMO`、`Putnam`、`USAMO`、`AIME`、`olympiad`、`competition math`
  或中文：数学竞赛、竞赛数学、奥林匹克、竞赛不等式/数论/几何/组合、
  证明校验、证明是否正确、找一个反例。

## 工作流程（五步）

### 第 1 步 — 解（纯推理，不求快）

只用推理，不调用任何外部工具。按 `references/solver_heuristics.md`
（Pólya 六板斧）找路：类比相关问题、特化到小情形手工算、泛化、放宽条件、
逆向、换一种表述。草稿、试探、犹豫都是**思考链**，保留在你自己这里，
不要写进最终文本里。

### 第 2 步 — 剥离思考链，只留证明正文

把解整理成**干净的证明正文**：定理与前提、定义、每一步推理、结论。
删掉所有"我试了 X 不行""感觉应该…""这里可能…"之类的叙述。
验证器只能看到这一份正文——**思考链一旦泄露给验证器，它会被带偏去附和
你的结论，验证就失效了。**

### 第 3 步 — 对抗验证（subagent，新鲜上下文）

调用 **subagent** 跑验证器，关键纪律：

- **新鲜上下文**：子代理不共享本会话上下文、不共享第 1、2 步的任何推理轨迹；
  它只收到第 2 步的证明正文 + 攻击指令。
- 攻击指令必须**具体**：附上 `references/verifier_patterns.md` 的失败模式
  清单，要求逐条对照、指出**具体缺口**（漏的情形、隐含假设、未证步骤、
  等号条件、方向错误…），禁止"整体逻辑没问题"式的泛泛结论。
- 给验证器两个必查项：**"这能证 RH 吗？"式的开放问题特化测试**
  （见下"红旗启发式"第 2 条）与**已知构造 / 反例冲突检查**。

### 第 4 步 — 判定与循环

- 验证器报**致命缺口** → 回到第 1 步重解，**最多 2 轮**；
- 2 轮后仍存在致命缺口 → 走第 5 步的弃权输出；
- 只有验证器零缺口通过，才给出 high；有缺口但已修补、或修补未被二次
  验证确认 → medium。

### 第 5 步 — 输出

固定结构（模板见 `references/presentation_prompts.md`）：

1. **解**：证明正文（只此一份，不混入思考链）；
2. **验证结论**：验证器发现了什么、修了什么、还留了什么；
3. **信心**：`high` / `medium` / 诚实弃权 `no confident solution`（附卡点与
   需要补的条件）。

渲染：先跑 `scripts/check_latex.sh`；有 TeX 引擎则用 `scripts/compile_pdf.sh`
编译 PDF；没有则输出 Markdown 数学（行内 `$…$`、行间 `$$…$$`），并提示
安装 TeX（脚本会给出各平台安装命令，见 `scripts/check_latex.sh`）。

## 红旗启发式（5 条，改变结果的原则）

这几条不是建议，是**纪律**。任一命中，默认按对应动作执行，除非你能说明
为什么不适用。

1. **验证前剥离思考链。** 验证器看到推理会被带偏附和。新鲜上下文、只给
   干净的证明正文——这是整个流程的前提，省不得。
2. **"这能证 RH 吗？"** 把定理特化到 ζ 函数如果是著名开放问题（黎曼猜想
   RH 及同类），那证明**必有缺口**——这是最可靠的红旗。验证器必须主动跑
   这个测试，而不是等它自然暴露。
3. **短证明 → 提取一般引理。** 先试 2×2 反例。一般形式若假，找出本例的
   特别处（是哪个额外假设救了它）；若引理为真，写下来单独验证。
4. **同一缺口出现两次 → 退一步。** 同一个缺口修完又出现，case split 可能
   在掩盖一个统一论证/统一反例。三行有时胜过十二页——先找统一视角，别再
   打补丁。
5. **诚实说"无自信解"。** 错而自信比诚实弃权更糟。走到第 4 步仍不合格就
   弃权，输出卡点与所需条件，绝不硬编。

## 验证器运行规范（subagent 调用细则）

- 每次验证开一次新 subagent；**不共享本会话历史**，参数里只放：
  `证明正文`、`失败模式清单（verifier_patterns.md 全文）`、
  `攻击指令`（逐条对照，给出具体反例/缺口，禁止泛泛肯定）、
  `已知构造提示`（如 RH 特化陷阱、经典反例族）。
- 验证器输出结构：`[致命缺口列表] / [非致命缺口列表] / [通过项] / 结论`。
  有致命缺口时给**最小反例或缺口定位**，方便你回到第 1 步。
- 你自己（会话侧）只做调度与归纳，**不要替验证器回答"对还是错"**。

## 引用文档

- `references/solver_heuristics.md` — Pólya 六板斧（解题启发）
- `references/verifier_patterns.md` — 验证器失败模式清单（攻击面）
- `references/presentation_prompts.md` — 输出/讲解模板
- `scripts/check_latex.sh` — LaTeX 可用性检查
- `scripts/compile_pdf.sh` — LaTeX → PDF 编译