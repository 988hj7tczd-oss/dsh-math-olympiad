# dsh-math-olympiad

> [!IMPORTANT]
> **依赖前置：相邻 `dsh-src` 检出（`link:` 依赖）**
> 本项目在开发形态下使用 `link:` 依赖指向相邻的 DeepSeek Harness 源码检出（`dsh-src`），
> 与当前仓库保持同一父目录布局（`<parent>/dsh-src`）。克隆本仓库后：
> 1. 先把官方 `deepseek-ai/deepseek-harness` 检出到与本仓库同级的 `dsh-src/` 目录，并执行其 `pnpm install && pnpm run build`；
> 2. 再按下方「安装」一节执行本仓库的 `pnpm install --offline && pnpm build` 与测试。
> 发布到 npm 的版本会尽量把 `link:` 依赖替换为 registry 真实版本；无法替换的内部包保持 `link:`，见各包 README 说明。


DSH 技能插件：**竞赛数学解题（对抗验证 + 校准信心）**。
面向 IMO / Putnam / USAMO / AIME 及各类数学竞赛题，流程为
"纯推理求解 → 剥离思考链 → 新鲜上下文 subagent 对抗验证 → 校准信心输出
（high / medium / 诚实 'no confident solution'）"，可选用 LaTeX 编译 PDF。

> 定位：这是**严谨流程 + 诚实弃权**的技能，**不承诺正确率**。
> 输出总是"解 + 验证结论 + 信心"三位一体；不确定就直说，不硬编答案。

## 目录结构

```
dsh-math-olympiad/
├── package.json                  # dsh.bundle 声明（发布为可安装 profile bundle）
├── cordis.yml                    # 开发期补丁覆盖层（scratch-plugin 风格，引用本机 src）
├── cordis.patch.yml              # 发布用 bundle 层（引用安装后的 lib 入口）
├── tsconfig.json                 # src/ → lib/ 构建配置
├── src/locator.ts                # Host 插件：提供 mathOlympiadSkills 服务（定位 skills/）
├── skills/dsh-math-olympiad/
│   ├── SKILL.md                  # frontmatter(触发词) + 5 红旗启发式 + 五步流程
│   ├── references/
│   │   ├── solver_heuristics.md      # Pólya 六板斧（中文重写）
│   │   ├── verifier_patterns.md      # 验证器失败模式清单（真实攻击面）
│   │   └── presentation_prompts.md   # 输出/讲解模板与数学排版约定
│   └── scripts/
│       ├── check_latex.sh            # TeX 引擎探测（无引擎给出各平台安装提示）
│       └── compile_pdf.sh            # LaTeX → PDF（两遍编译，退出码语义明确）
├── tests/smoke.e2e.ts            # 离线冒烟：结构/触发词/5 原则/subagent 协议/弃权路径/脚本行为
├── README.md
└── LICENSE                       # MIT
```

## 安装（发布形态：profile bundle）

技能以 `@deepseek-ai/dsh-skill-filesystem` 的 `customSkillDirs` 挂载
（PROMPT 指定的 DSH 侧集成方式）：

```sh
cd dsh-math-olympiad 的父目录
dsh plugin --profile <name> add ./dsh-math-olympiad
dsh --profile <name>
```

- 前置：profile 需含 `@deepseek-ai/dsh-base`（默认第一个 bundle，提供
  `skill` 注册表与 `@deepseek-ai/dsh-skill-filesystem` 包）。
- `package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`；该层插入两个
  行：`dsh-math-olympiad-locator`（把技能目录暴露为 `mathOlympiadSkills`
  服务，构造时从 `import.meta.url` 定位包内 `skills/`）与
  `dsh-math-olympiad-skill`（独立的 `providerName: math-olympiad`
  skill-filesystem 提供者，避免与 base 行冲突；配置
  `includeDefaultRoots: false`，只扫本包的 `customSkillDirs`，不重复扫描
  默认根）。
- git 直装只取**源码**：`prepare` 负责构建 `lib/`（自包含 tsc，无需
  monorepo 上下文）。但 **pnpm ≥10 默认拒绝运行 git 依赖的 `prepare`**，
  首次 `add` 会失败——先允许构建再重跑 `add`：在 profile 的
  `pnpm-workspace.yaml` 里加

  ```yaml
  allowBuilds:
    dsh-math-olympiad: true
  ```

  （或用交互式 `pnpm approve-builds`）。注意这是"允许该包源码在安装期于你
  的机器上执行"的授权，只对信任的包放开。若不想走这一步，直接
  `dsh plugin add ./dsh-math-olympiad-0.1.0.tgz`（`pnpm pack` 产物）或从
  npm 安装——这两种分发自带 `lib/` 构建产物，无需任何构建许可。

## 本地开发接法（无需发布）

```sh
dsh --profile <name> --patch ./cordis.yml     # 引用 ./src/locator.ts
```

`cordis.yml` 采用 scratch-plugin 风格，把本机 checkout 的
`src/locator.ts` 直接作为插件行；DSH 可直接运行 TS。

## 验证

```sh
node tests/smoke.e2e.ts          # Node ≥ 23.6 直接跑；22.6–23.5 加 --experimental-strip-types
# 或
npx tsx tests/smoke.e2e.ts
```

冒烟覆盖（对照验收标准）：

1. 交付物结构完整、shell 脚本可执行、`bash -n` 语法合法；
2. frontmatter 触发词覆盖 IMO / Putnam / USAMO / olympiad / competition
   math / 数学竞赛 / 证明校验 等；
3. 5 条红旗启发式原样保留（含 `no confident solution` 弃权条款）；
4. 验证器协议：SKILL.md 明示 subagent + 新鲜上下文 + 不共享推理轨迹；
   测试断言验证器（stub）被调用，并做结构断言"verify 入参只有 `proof` 一个
   字段"（思考链无转发通道——该保证由 harness 只转发 `.proof` 构造，真正的
   防泄漏依赖 SKILL.md 正文纪律，详见 smoke 文件内的构造性说明）；
5. 弃权路径：构造坏题 → 2 轮重解仍失败（修复链用例验证第二轮确实拿到新解）
   → 输出 `no confident solution` 与卡点，不硬编；
6. 脚本行为（与机器布局无关）：`check_latex.sh` 无引擎退出码 1 并打印安装
   提示（有引擎退出码 0 并声明引擎）；`compile_pdf.sh` 的"无引擎"分支用构造
   的引擎隔离 PATH 在任何机器上确定性触发（exit 1 提示先跑 check），引擎
   参数白名单外 exit 3；引擎**可用**时用 node:test 真实调用 `compile_pdf.sh`
   验证退出码 0 与 PDF 产物存在、坏 tex exit 2（引擎不可用时该用例显式
   skip 并打印原因，不假绿）；流程回退 Markdown 数学不崩。

## 用法摘要（技能运行时）

1. 解（纯推理，Pólya 六板斧）；
2. 剥离思考链，只留证明正文；
3. `subagent` 新鲜上下文对抗验证（verifier_patterns 失败模式逐条攻击，
   含"这能证 RH 吗？"开放问题特化测试）；
4. 致命缺口 → 回到 1，**最多 2 轮**；仍失败 → 诚实弃权；
5. 输出 解 + 验证结论 + 信心（high / medium / no confident solution）；
   `check_latex.sh` 通过则 `compile_pdf.sh` 出 PDF，否则 Markdown 数学。

## 局限

- 正确率无承诺：验证增强严谨性，不消除出错可能；
- subagent 验证器的质量取决于其模型与新鲜上下文的隔离纪律——思考链一旦
  混入正文，验证即失效（红旗第 1 条）；
- 弃权是特性不是失败：`no confident solution` 附卡点与所需条件，
  便于用户补充条件或交给更强模型。

## 许可

MIT。启发式与方法论借鉴自上游公开方法论（Pólya、对抗验证模式），
本项目内全部正文为独立中文重写，shell 脚本自写；不含上游专有源码副本。

## 权限、失败边界与 DSH STORE 状态

- [PERMISSIONS.md](./PERMISSIONS.md)：运行时读取面 / 命令面（固定 argv，非 shell）/ 写面 / 外部服务 / 失败边界 / 供应链 / 文件权限信号（无 chmod/chown、644、无 setuid/setgid）。
- [docs/store-evidence.md](./docs/store-evidence.md)：一次性 Profile 安装 → 启动（工具注册清单）→ 卸载步骤、本地离线证据、待宿主补录真实运行记录说明，并逐项回应 DSH STORE 五类审查信号（仓库 canonical 匹配 / Node 声明 / 供应链 / 文件权限 / 命令权限）。
- STORE 复检由 dsh-safe-plugin-manager 每 3 小时自动执行；本仓库已按清单契约声明（package.json 的 `repository` / `engines.node` / `dsh.compatibility` / `dsh.permissions`）。
