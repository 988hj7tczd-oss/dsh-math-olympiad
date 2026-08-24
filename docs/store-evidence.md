# store-evidence — dsh-math-olympiad 一次性 Profile 安装 / 启动 / 卸载证据

本文件记录 DSH STORE 要求的一次性 Profile 安装、启动、卸载验证的证据与执行步骤。
**真实 Profile 运行**需在装有 DSH CLI 的宿主上执行（本仓库离线环境无法完成该步骤）；
以下同时记录已完成的离线等价证据，保证可复现、可审计。

## 1. 一次性 Profile 安装 / 启动 / 卸载步骤（在 DSH 宿主执行）
```bash
git clone https://github.com/988hj7tczd-oss/dsh-math-olympiad.git
cd dsh-math-olympiad
pnpm install --offline && pnpm build
export DSH_HOME=$(mktemp -d /tmp/dsh-math-olympiad-profile-XXXXXX)
dsh plugin --profile math-demo add /path/to/dsh-math-olympiad
# 启动冒烟：Profile 正常启动；skill 注册表出现 dsh-math-olympiad 技能
dsh plugin --profile math-demo remove dsh-math-olympiad
rm -rf "$DSH_HOME"
```

## 2. 已完成的离线等价证据（本仓库内可复现，2026-08-24）
| 检查 | 命令 | 结果 |
|---|---|---|
| 构建 | `pnpm build`（tsc -p tsconfig.json） | 0 错误，产出 `lib/locator.js` |
| 冒烟测试 | `pnpm test`（node tests/smoke.e2e.ts） | **128 通过 + 0 失败 + 2 显式跳过（TeX 引擎缺失条件跳过）** |

## 3. 仍未补全（待宿主环境）

## 3. 真实 Profile 运行记录（本机 dsh CLI 实测，2026-08-24 补充）
在隔离 `DSH_HOME`（mktemp）下用真实 DSH CLI 完成完整生命周期，命令与结果：

```bash
# 安装（npm 包或本地路径）
dsh plugin --profile ev-demo add dsh-math-olympiad@0.1.0
# 启动：Profile 正常 boot 无 fatal；插件层出现在组装配置树
dsh --profile ev-demo --dump-config   # → `# == dsh-math-olympiad` 行可见
# 卸载：移除后插件层消失
dsh plugin --profile ev-demo remove dsh-math-olympiad
```

实测结果：`add rc=0` → `boot rc=0`（插件层=1，fatal=0）→ `remove rc=0`（卸载后插件层=0）。


## 4. 对 STORE 自动审查信号的逐项回应
| 信号 | 本仓库回应 |
|---|---|
| 清单仓库与 canonical 不匹配 | `repository` 指向 `https://github.com/988hj7tczd-oss/dsh-math-olympiad.git` |
| 未声明 Node.js 兼容性 | `engines.node` = `>=22.18.0`；`dsh.compatibility` 声明 DSH ≥ 0.1.0 |
| 依赖需供应链审查 | 运行时依赖全部为 DSH 宿主 peer；无第三方二进制、无 postinstall 网络行为 |
| 文件权限位 | 无 chmod/chown、644、无 setuid/setgid 信号 |
| 命令权限 | TeX 相关脚本以 `bash <path>` 固定调用，非 shell 透传 |