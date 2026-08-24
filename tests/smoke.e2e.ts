/**
 * dsh-math-olympiad — 离线冒烟测试（.e2e.ts）
 *
 * 运行方式（无需任何 npm 依赖，Node ≥ 22.6 原生剥离类型）：
 *   node tests/smoke.e2e.ts          （Node ≥ 23.6 直接跑 TS）
 *   node --experimental-strip-types tests/smoke.e2e.ts   （Node 22.6–23.5）
 *   npx tsx tests/smoke.e2e.ts       （兜底）
 *
 * 覆盖的验收点：
 *   1. 交付物结构完整（skills/SKILL.md + references/* + scripts/* + README +
 *      tests + 插件脚手架 package.json / cordis.yml / cordis.patch.yml /
 *      src/*），shell 脚本可执行。
 *   2. SKILL.md frontmatter 触发词覆盖 IMO/Putnam/USAMO/olympiad/竞赛/证明校验
 *      等；5 条红旗启发式（含"无自信解"弃权条款）原样保留；流程写明
 *      "最多 2 轮"。
 *   3. 验证器协议：技能正文明示 subagent + 新鲜上下文；本测试把 subagent
 *      调用替换为受控 stub 并**断言其被调用**；"只收到剥离后的证明正文"
 *      由 harness 只转发 `opts.solve().proof` 这一结构保证（思考链无转发
 *      通道），测试以结构断言锁定该契约——注意这是构造性保证，不是对真实
 *      泄漏的检测（真正防泄漏依赖 SKILL.md 第 2 步的正文纪律）。
 *   4. 弃权路径：构造坏题 → 输出 no confident solution 而不硬编。
 *   5. 无 LaTeX 时不崩溃并提示安装；check_latex.sh / compile_pdf.sh 退出码
 *      语义正确；"无引擎"分支用构造的引擎隔离 PATH 在任何机器上确定性触发；
 *      引擎**可用**时用 node:test 真实调用 compile_pdf.sh 验证退出码 0 与
 *      PDF 产物存在（引擎不可用时该用例显式 skip 并打印原因，不假绿）。
 *
 * 说明：生产环境里"解→验证→结论"由模型按 SKILL.md 执行（真实 subagent
 * 工具）；本测试以确定性 harness 复现同一协议（MAX_VERIFY_ROUNDS = 2、
 * 置信标定规则与 SKILL.md 一致），保证链路离线可复现、不崩。
 */
import { existsSync, readFileSync, statSync, mkdtempSync, writeFileSync, symlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SKILL_DIR = join(ROOT, 'skills', 'dsh-math-olympiad')
const REF_DIR = join(SKILL_DIR, 'references')
const SCRIPT_DIR = join(SKILL_DIR, 'scripts')

const failures: string[] = []
let passed = 0
/** [7b] 引擎分支用例被显式跳过的个数（node:test skip，不假绿）。 */
let engineSkipped = 0

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++
    console.log(`  ok - ${name}`)
  } else {
    failures.push(name)
    console.log(`  FAIL - ${name}${detail ? ` (${detail})` : ''}`)
  }
}

function read(p: string): string {
  return readFileSync(p, 'utf8')
}

function contains(text: string, needle: string): boolean {
  return text.includes(needle)
}

/**
 * 极简 frontmatter 提取：取首尾 `---` 之间的原文，并把行连接处折叠为空格
 * （近似 YAML `>` 块标量的折叠语义），使跨行短语仍可被子串匹配命中。
 */
function frontmatter(md: string): string {
  const lines = md.split('\n')
  if (!lines[0].trim().startsWith('---')) return ''
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (end === -1) return ''
  return (
    lines
      .slice(1, end)
      .join(' ')
      // 近似 YAML `>` 折叠：连续空白（含续行缩进）折叠为单个空格
      .replace(/\s+/g, ' ')
      .trim()
  )
}

const MAX_VERIFY_ROUNDS = 2
type Confidence = 'high' | 'medium' | 'no confident solution'

interface SolveResult {
  /** 私有思考链（测试中用于断言不泄漏）。 */
  chain: string[]
  /** 干净证明正文。 */
  proof: string
}

interface VerifyInput {
  proof: string
}

interface VerifyOutput {
  fatal: string[]
  gaps: string[]
}

interface FlowOptions {
  solve: () => SolveResult
  /** 生产 = 调用 subagent（新鲜上下文）；测试 = 受控 stub。 */
  verify: (input: VerifyInput) => Promise<VerifyOutput>
  latexAvailable: boolean
}

interface FlowResult {
  proof: string
  confidence: Confidence
  conclusion: string
  verifyRounds: number
  rendered: { kind: 'pdf' | 'markdown'; value: string }
}

/** 与 SKILL.md 五步协议一致的确定性流程（验证最多 2 轮）。 */
async function runFlow(opts: FlowOptions): Promise<FlowResult> {
  let rounds = 0
  let proof = opts.solve().proof
  let last: VerifyOutput | null = null
  for (;;) {
    rounds++
    last = await opts.verify({ proof })
    if (last.fatal.length === 0) break
    if (rounds >= MAX_VERIFY_ROUNDS) break
    proof = opts.solve().proof // 验证失败 → 回到第 1 步重解
  }
  const fatal = last?.fatal ?? []
  const gaps = last?.gaps ?? []
  let confidence: Confidence
  if (fatal.length > 0) confidence = 'no confident solution'
  else if (gaps.length === 0) confidence = 'high'
  else confidence = 'medium'
  const conclusion =
    confidence === 'no confident solution'
      ? `卡点：${fatal.join('；')}。${rounds} 轮修复后仍未通过，按诚实弃权条款不硬编答案。`
      : gaps.length === 0
        ? '验证器零缺口通过（含退化/等号/边界检查）。'
        : `验证器指出非致命缺口：${gaps.join('；')}。`
  const rendered = opts.latexAvailable
    ? { kind: 'pdf' as const, value: `${SKILL_DIR}/solution.pdf` }
    : { kind: 'markdown' as const, value: proof }
  return { proof, confidence, conclusion, verifyRounds: rounds, rendered }
}

async function main(): Promise<number> {
  console.log(`dsh-math-olympiad smoke (root: ${ROOT})`)

  console.log('\n[1] 交付物结构')
  const deliverables = [
    'package.json',
    'cordis.yml',
    'cordis.patch.yml',
    'tsconfig.json',
    'LICENSE',
    'README.md',
    'src/locator.ts',
    'skills/dsh-math-olympiad/SKILL.md',
    'skills/dsh-math-olympiad/references/solver_heuristics.md',
    'skills/dsh-math-olympiad/references/verifier_patterns.md',
    'skills/dsh-math-olympiad/references/presentation_prompts.md',
    'skills/dsh-math-olympiad/scripts/check_latex.sh',
    'skills/dsh-math-olympiad/scripts/compile_pdf.sh',
    'tests/smoke.e2e.ts',
  ]
  for (const rel of deliverables) {
    check(`文件存在 ${rel}`, existsSync(join(ROOT, rel)))
  }
  for (const s of ['check_latex.sh', 'compile_pdf.sh']) {
    const mode = statSync(join(SCRIPT_DIR, s)).mode
    check(`脚本可执行 ${s}`, (mode & 0o111) !== 0)
  }

  const skill = read(join(SKILL_DIR, 'SKILL.md'))
  const fm = frontmatter(skill)
  check('SKILL.md 有 frontmatter', fm.length > 0)

  console.log('\n[2] 触发词覆盖（验收 1）')
  for (const t of [
    'solve this IMO problem',
    'prove this olympiad inequality',
    'verify this competition proof',
    'find a counterexample',
    'is this proof correct',
    'IMO',
    'Putnam',
    'USAMO',
    'olympiad',
    'competition math',
    '数学竞赛',
    '竞赛数学',
    '奥林匹克',
    '证明校验',
  ]) {
    check(`frontmatter 含触发词: ${t}`, contains(fm, t))
  }

  console.log('\n[3] 5 条红旗启发式 + 弃权条款（验收 2/4 的静态面）')
  for (const [label, needle] of [
    ['原则1 剥离思考链', '剥离思考链'],
    ['原则2 开放问题/这能证 RH 吗', '这能证 RH 吗'],
    ['原则2b 黎曼/ζ 红旗', 'RH'],
    ['原则3 提取一般引理', '一般引理'],
    ['原则3b 2×2 反例', '2×2'],
    ['原则4 同一缺口出现两次 → 退一步', '同一缺口出现两次'],
    ['原则5 no confident solution', 'no confident solution'],
    ['原则5b 无自信解', '无自信解'],
    ['弃权条款：错而自信比诚实弃权更糟', '错而自信比诚实弃权更糟'],
  ]) {
    check(label, contains(skill, needle))
  }

  console.log('\n[4] 流程与 subagent 验证器协议（验收 3）')
  for (const [label, needle] of [
    ['流程：纯推理求解', '纯推理'],
    ['流程：剥离思考链只留证明正文', '只留证明正文'],
    ['流程：subagent', 'subagent'],
    ['流程：新鲜上下文', '新鲜上下文'],
    ['流程：不共享推理轨迹', '推理轨迹'],
    ['流程：回到第 1 步', '回到第 1 步'],
    ['流程：最多 2 轮', '最多 2 轮'],
    ['输出：high', 'high'],
    ['输出：medium', 'medium'],
    ['输出：三位一体（解+验证+信心）', '验证结论'],
    ['LaTeX 检查脚本引用', 'check_latex.sh'],
    ['PDF 编译脚本引用', 'compile_pdf.sh'],
    ['无 LaTeX 回退 Markdown 数学', 'Markdown 数学'],
    ['引用 solver_heuristics.md', 'solver_heuristics.md'],
    ['引用 verifier_patterns.md', 'verifier_patterns.md'],
    ['引用 presentation_prompts.md', 'presentation_prompts.md'],
  ]) {
    check(label, contains(skill, needle))
  }

  console.log('\n[5] 参考文档内容')
  const solver = read(join(REF_DIR, 'solver_heuristics.md'))
  for (const t of ['类比', '特化', '泛化', '放宽', '逆向', '换一种表述', '退化']) {
    check(`solver_heuristics 含「${t}」`, contains(solver, t))
  }
  const verifier = read(join(REF_DIR, 'verifier_patterns.md'))
  for (const t of ['RH', '最小反例', '循环论证', '退化', 'case split', '隐含假设', '输出协议']) {
    check(`verifier_patterns 含「${t}」`, contains(verifier, t))
  }
  const pres = read(join(REF_DIR, 'presentation_prompts.md'))
  for (const t of ['high', 'medium', 'no confident solution', '硬编', 'Markdown 数学', 'compile_pdf.sh']) {
    check(`presentation_prompts 含「${t}」`, contains(pres, t))
  }

  console.log('\n[6] 插件脚手架（cordis.yml / cordis.patch.yml / package.json / tsconfig）')
  const patch = read(join(ROOT, 'cordis.patch.yml'))
  for (const [label, needle] of [
    ['patch: locator 行（安装包入口）', 'dsh-math-olympiad/lib/locator.js'],
    ['patch: skill-filesystem 行', '@deepseek-ai/dsh-skill-filesystem'],
    ['patch: inject mathOlympiadSkills', 'mathOlympiadSkills'],
    ['patch: providerName 隔离', 'providerName: math-olympiad'],
    ['patch: customSkillDirs', 'customSkillDirs'],
    ['patch: !!js 定位表达式', 'ctx.mathOlympiadSkills.skillsDir'],
  ]) {
    check(label, contains(patch, needle))
  }
  check('patch: includeDefaultRoots 隔离默认根（只扫 customSkillDirs）', contains(patch, 'includeDefaultRoots: false'))
  const dev = read(join(ROOT, 'cordis.yml'))
  const devLoc = './src/locator.ts'
  check('cordis.yml 以相对路径引用本仓源码', contains(dev, devLoc))
  check('cordis.yml 引用的源码存在', existsSync(join(ROOT, 'src', 'locator.ts')))
  check('cordis.yml 同样含 skill-filesystem 行', contains(dev, '@deepseek-ai/dsh-skill-filesystem'))
  check('cordis.yml includeDefaultRoots 隔离默认根（只扫 customSkillDirs）', contains(dev, 'includeDefaultRoots: false'))

  const pkg = JSON.parse(read(join(ROOT, 'package.json'))) as {
    name: string
    license: string
    type: string
    dsh?: { bundle?: { patch?: string } }
    files?: string[]
    scripts?: Record<string, string>
  }
  check('package.json name', pkg.name === 'dsh-math-olympiad')
  check('package.json MIT', pkg.license === 'MIT')
  check('package.json type=module', pkg.type === 'module')
  check('package.json 声明 dsh.bundle', pkg.dsh?.bundle?.patch === './cordis.patch.yml')
  check('package.json files 含 skills', Array.isArray(pkg.files) && pkg.files.includes('skills'))
  check('package.json scripts.test', typeof pkg.scripts?.test === 'string')

  const tsconfig = JSON.parse(read(join(ROOT, 'tsconfig.json'))) as {
    compilerOptions?: { outDir?: string; rootDir?: string; module?: string }
  }
  check('tsconfig outDir=lib', tsconfig.compilerOptions?.outDir === 'lib')
  check('tsconfig rootDir=src', tsconfig.compilerOptions?.rootDir === 'src')
  check('tsconfig module=NodeNext', tsconfig.compilerOptions?.module === 'NodeNext')

  console.log('\n[7] Shell 脚本静态与行为检查（验收 5）')
  for (const s of ['check_latex.sh', 'compile_pdf.sh']) {
    const r = spawnSync('bash', ['-n', join(SCRIPT_DIR, s)], { encoding: 'utf8' })
    check(`bash -n 语法合法 ${s}`, r.status === 0, r.stderr.trim())
  }
  const checkRun = spawnSync('bash', [join(SCRIPT_DIR, 'check_latex.sh')], { encoding: 'utf8' })
  const runOk = checkRun.status === 0 || checkRun.status === 1
  check('check_latex.sh 退出码 ∈ {0,1}', runOk, `exit=${checkRun.status}`)
  if (checkRun.status === 0) {
    check('check_latex.sh 有引擎时声明引擎', /引擎|found/.test(`${checkRun.stdout}${checkRun.stderr}`))
  } else {
    check(
      'check_latex.sh 无引擎时给出安装提示',
      /brew|apt-get|pacman|dnf|安装/.test(`${checkRun.stdout}${checkRun.stderr}`),
      checkRun.stderr.trim().slice(0, 120),
    )
  }
  const compile = join(SCRIPT_DIR, 'compile_pdf.sh')
  const usage = spawnSync('bash', [compile], { encoding: 'utf8' })
  check('compile_pdf.sh 无参数 → exit 3', usage.status === 3)
  const missing = spawnSync('bash', [compile, join(ROOT, 'nope.tex')], { encoding: 'utf8' })
  check('compile_pdf.sh 输入不存在 → exit 3', missing.status === 3)
  const wrong = spawnSync('bash', [compile, join(ROOT, 'README.md')], { encoding: 'utf8' })
  check('compile_pdf.sh 非 tex 输入 → exit 3', wrong.status === 3)
  const tmp = mkdtempSync(join(tmpdir(), 'dshmo-'))
  const texPath = join(tmp, 'sample.tex')
  writeFileSync(texPath, '\\documentclass{article}\\begin{document}hi\\end{document}\n')
  // "无引擎"分支必须与机器布局无关：硬编码 PATH=/usr/bin:/bin 在
  // Debian/Ubuntu（pdflatex 就在 /usr/bin）会真实编译成功（exit 0）导致误判
  // （审查 L3）。node 的 spawn 用**子进程 env 的 PATH** 解析可执行文件，因此
  // 这里构造一个只含 bash/dirname/basename、不含任何 TeX 引擎的 PATH，
  // 使自动探测在所有机器上都确定性地落到 exit 1。
  const locProbe = spawnSync('bash', ['-c', 'command -v bash; command -v dirname; command -v basename'], { encoding: 'utf8' })
  const locTools = locProbe.stdout.trim().split('\n').map((s) => s.trim())
  const noLatexBin = mkdtempSync(join(tmpdir(), 'dshmo-nolatex-bin-'))
  let noLatexEnv: NodeJS.ProcessEnv = { ...process.env, PATH: '/usr/bin:/bin' }
  if (locProbe.status === 0 && locTools.length === 3 && locTools.every((p) => p.length > 0 && existsSync(p))) {
    for (const [i, tool] of ['bash', 'dirname', 'basename'].entries()) symlinkSync(locTools[i], join(noLatexBin, tool))
    noLatexEnv = { ...process.env, PATH: noLatexBin }
  }
  const noLatex = spawnSync('bash', [compile, texPath], { encoding: 'utf8', env: noLatexEnv })
  check(
    'compile_pdf.sh 无引擎 → exit 1 且提示',
    noLatex.status === 1 && /check_latex/.test(noLatex.stderr + noLatex.stdout),
    `exit=${noLatex.status}`,
  )
  // 引擎白名单：任意 PATH 可执行文件不得被当作引擎执行（审查 L4）。
  const badEngine = spawnSync('bash', [compile, texPath, 'faketex-zzz'], { encoding: 'utf8' })
  check('compile_pdf.sh 白名单外引擎 → exit 3', badEngine.status === 3, `exit=${badEngine.status}`)

  console.log('\n[7b] 真实 PDF 编译（验收 5 的引擎可用分支；node:test）')
  // 引擎**可用**时真实调用 compile_pdf.sh：验证退出码 0 与 PDF 产物存在，
  // 并覆盖"有引擎但编译失败 → exit 2"。引擎不可用时用 node:test 的 skip
  // 显式跳过并打印原因（审查 M2：此前的"有 latex → pdf 渲染"只是断言 harness
  // 内部布尔分支，PDF 从未真实生成——不假绿）。
  const latexProbe = spawnSync('bash', [join(SCRIPT_DIR, 'check_latex.sh')], { encoding: 'utf8' })
  const latexAvailable = latexProbe.status === 0
  const skipReason = latexAvailable
    ? false
    : `本机无 TeX 引擎（check_latex.sh 退出码 ${latexProbe.status}），无法真实调用 compile_pdf.sh；安装 TeX 后此用例自动运行`
  const latexDir = mkdtempSync(join(tmpdir(), 'dshmo-latex-'))
  const latexTex = join(latexDir, 'sample.tex')
  writeFileSync(latexTex, '\\documentclass{article}\\begin{document}Hello, olympiad $x^2$.\\end{document}\n')
  const engineCaseFails: string[] = []
  await test(
    'compile_pdf.sh 真实编译：退出码 0 且产物 sample.pdf 存在',
    { skip: skipReason, timeout: 120_000 },
    () => {
      const r = spawnSync('bash', [compile, latexTex], { encoding: 'utf8', timeout: 110_000 })
      const pdf = join(latexDir, 'sample.pdf')
      if (r.status !== 0 || !existsSync(pdf)) {
        const detail = `exit=${r.status} pdfExists=${existsSync(pdf)} out=${`${r.stdout ?? ''}${r.stderr ?? ''}`.slice(0, 200)}`
        engineCaseFails.push(detail)
        throw new Error(detail)
      }
    },
  )
  await test(
    'compile_pdf.sh 有引擎、坏 tex → exit 2',
    { skip: skipReason, timeout: 120_000 },
    () => {
      const badTex = join(latexDir, 'bad.tex')
      writeFileSync(badTex, '\\documentclass{article}\\begin{document}\\zzundefined{}\n')
      const r = spawnSync('bash', [compile, badTex], { encoding: 'utf8', timeout: 110_000 })
      if (r.status !== 2) {
        const detail = `exit=${r.status}`
        engineCaseFails.push(detail)
        throw new Error(detail)
      }
    },
  )
  if (engineCaseFails.length > 0) {
    failures.push(`真实 PDF 编译分支失败：${engineCaseFails.join('; ')}`)
  } else if (latexAvailable) {
    passed += 2
  } else {
    engineSkipped += 2
  }

  console.log('\n[8] 解→验证→结论 链路（验收 3：subagent stub 协议 + 置信标定/弃权）')
  const chainText = '我试过把 n 放大但不行，感觉应该用 Cauchy，先放缩一下再看看'
  const goodProof =
    '定理：对任意正整数 n，Σ_{i=1..n} i² = n(n+1)(2n+1)/6。' +
    '证明：对 n 归纳。n=1 时两边均为 1。设对 n 成立，则 Σ_{i=1..n+1} i² = n(n+1)(2n+1)/6 + (n+1)² = (n+1)(n+2)(2n+3)/6。证毕。'
  const shakyProof =
    '证明：显然该和等于某个只含 n 的多项式 P(n)。令 P 的次数为 3，' +
    '由 P(1)=1, P(2)=5, P(3)=14, P(4)=30 反解系数，断言对一切 n 成立。'

  let verifyCalls = 0
  let lastInput: VerifyInput | null = null

  const good = await runFlow({
    solve: () => ({ chain: [chainText], proof: goodProof }),
    verify: async (input) => {
      verifyCalls++
      lastInput = input
      return { fatal: [], gaps: [] }
    },
    latexAvailable: false,
  })
  check('好题：验证器被调用（subagent stub ≥1 次）', verifyCalls >= 1, `calls=${verifyCalls}`)
  // --- 构造性说明（审查 L2）：runFlow 只把 `opts.solve().proof` 传给 verify，
  // `chain` 在 harness 内没有任何消费/转发通道，goodProof 字面量本身也不含
  // 思考链用语——因此下面"未泄漏"断言由构造保证恒真，没有检测能力。保留为
  // 结构断言的意义是锁定"verify 入参只有 proof 一个字段"这一契约（今后若有人
  // 给 VerifyInput 增加字段或把 chain 传进去，此断言会抓住）；真正的"思考链
  // 不泄漏"保障在 SKILL.md 第 2 步的正文纪律，本离线 harness 无法运行时检测。
  check(
    '好题：verify 入参只有 proof 字段（无 chain 通道，结构断言）',
    lastInput !== null && Object.keys(lastInput).length === 1 && 'proof' in lastInput && !lastInput.proof.includes(chainText),
    lastInput === null ? 'verify 未被调用' : `keys=${Object.keys(lastInput).join(',')}`,
  )
  check('好题：输出含证明正文', good.proof === goodProof)
  check('好题：置信标定 high', good.confidence === 'high', good.confidence)
  check('好题：验证结论存在', good.conclusion.length > 0)
  check('好题：无 LaTeX → markdown 数学', good.rendered.kind === 'markdown', good.rendered.kind)
  check('好题：验证轮数=1', good.verifyRounds === 1)

  const medium = await runFlow({
    solve: () => ({ chain: [chainText], proof: goodProof }),
    verify: async () => ({ fatal: [], gaps: ['等号条件未单独验证'] }),
    latexAvailable: false,
  })
  check('缺口头：置信标定 medium', medium.confidence === 'medium', medium.confidence)
  check('缺口头：结论提及缺口', medium.conclusion.includes('等号条件'))

  let calls2 = 0
  // "回到第 1 步重解"要真的产出新解：第 1 轮给含缺口的版本，第 2 轮给修复版
  // （审查 L5：此前两轮 solve() 返回同一份证明，循环只是机械地重跑 verify）。
  const gappyProof =
    '定理：对任意正整数 n，Σ_{i=1..n} i² = n(n+1)(2n+1)/6。' +
    '证明：对 n 归纳。设对 n 成立，则 Σ_{i=1..n+1} i² = Σ_{i=1..n} i² + (n+1)² = … 证毕。'
  const fixedProof = goodProof
  let solveRound = 0
  const firstRound = await runFlow({
    solve: () => {
      solveRound++
      return solveRound === 1
        ? { chain: [chainText], proof: gappyProof }
        : { chain: [chainText], proof: fixedProof }
    },
    verify: async (_input) => {
      calls2++
      return calls2 === 1
        ? { fatal: ['归纳基例 n=1 未单独验证'], gaps: [] }
        : { fatal: [], gaps: [] }
    },
    latexAvailable: true,
  })
  check('修复链：第一轮致命缺口 → 第二轮通过（轮数=2）', firstRound.verifyRounds === 2, `${firstRound.verifyRounds}`)
  check('修复链：第二轮拿到的是新解（真实"回到第 1 步重解"）', firstRound.proof === fixedProof && solveRound === 2)
  check('修复链：修复后置信 high', firstRound.confidence === 'high', firstRound.confidence)
  // runFlow 的 latexAvailable=true 只决定"渲染决策分支"（标记 pdf）；真实的
  // PDF 产出由上方 [7b] 用 node:test 调用 compile_pdf.sh 验证（本机无引擎时
  // 显式 skip）——此处不再把内部布尔分支冒充成"PDF 已真实渲染"（审查 M2）。
  check('修复链：latexAvailable=true → 渲染决策为 pdf（真实编译见 [7b]）', firstRound.rendered.kind === 'pdf', firstRound.rendered.kind)

  const bad = await runFlow({
    // 坏题：两轮重解都产出同一份不充分证明（有意为之——重解仍失败 → 弃权）
    solve: () => ({ chain: [chainText], proof: shakyProof }),
    verify: async () => ({ fatal: ['未证假设：次数为 3 且系数反解对所有 n 成立'], gaps: [] }),
    latexAvailable: false,
  })
  check('坏题：走到 2 轮上限', bad.verifyRounds === 2, `${bad.verifyRounds}`)
  check('坏题：诚实弃权 no confident solution', bad.confidence === 'no confident solution', bad.confidence)
  check('坏题：结论给出卡点而非硬编', bad.conclusion.includes('卡点'))
  check('坏题：流程不崩，仍输出证明+结论', bad.proof.length > 0 && bad.conclusion.length > 0)

  console.log('\n[9] README / LICENSE 基本内容')
  const readme = read(join(ROOT, 'README.md'))
  for (const t of ['dsh-math-olympiad', 'no confident solution', '安装', '验收', 'MIT']) {
    check(`README 提及「${t}」`, contains(readme, t))
  }
  const lic = read(join(ROOT, 'LICENSE'))
  check('LICENSE 为 MIT', lic.includes('MIT License'))

  console.log(
    `\n结果：${passed} 通过，${failures.length} 失败` +
      (engineSkipped > 0 ? `，${engineSkipped} 项引擎分支用例显式跳过（node:test 输出见上）` : ''),
  )
  if (failures.length > 0) {
    console.log('失败项：')
    for (const f of failures) console.log(`  - ${f}`)
    return 1
  }
  return 0
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    console.error('smoke crashed:', err)
    process.exitCode = 1
  })