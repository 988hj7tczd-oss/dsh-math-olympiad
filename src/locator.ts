/**
 * dsh-math-olympiad — skill-dir locator.
 *
 * Host-side provider plugin that resolves this package's own `skills/`
 * directory (the competition-math skill bundle) and publishes it as the
 * `mathOlympiadSkills` service, so a composition row can point
 * `@deepseek-ai/dsh-skill-filesystem`'s `customSkillDirs` at the checkout
 * without hard-coding a path:
 *
 *   - id: dsh-math-olympiad-skill
 *     name: '@deepseek-ai/dsh-skill-filesystem'
 *     inject: [mathOlympiadSkills]
 *     config:
 *       providerName: math-olympiad
 *       customSkillDirs:
 *         - !!js ctx.mathOlympiadSkills.skillsDir
 *
 * Works from both layouts: the module runs as `src/locator.ts` during local
 * development and as `lib/locator.js` after `pnpm build` / install — in both
 * cases the package root (the directory holding `package.json`) is the parent
 * of this module's own directory (`src/` / `lib/`), i.e. one directory up from
 * `src/`/`lib/` (which is two segments up from the module file itself).
 * `resolvePackageRoot()` below implements exactly that single-dirname ascent
 * and falls back to the module's own directory only if no `package.json` sits
 * there.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-math-olympiad-locator'

/** Paths this bundle owns, exposed to composition config via `!!js`. */
export interface MathOlympiadLocator {
  /** Absolute path of the skill's directory (holds `SKILL.md`). */
  readonly skillsDir: string
  /** Absolute path of the skill's `references/` directory. */
  readonly referencesDir: string
  /** Absolute path of the skill's `scripts/` directory. */
  readonly scriptsDir: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Skill-dir locator provided by this plugin; consume it via `inject`. */
    mathOlympiadSkills?: MathOlympiadLocator
  }
}

/** Register the locator service. */
export function apply(ctx: Context): void {
  const skillsDir = resolveSkillsDir()
  ctx.provide('mathOlympiadSkills', {
    skillsDir,
    referencesDir: join(skillsDir, 'references'),
    scriptsDir: join(skillsDir, 'scripts'),
  })
  if (!existsSync(skillsDir)) {
    ctx.logger.warn(`[dsh-math-olympiad] skills dir not found: ${skillsDir}`)
  } else {
    ctx.logger.info(`[dsh-math-olympiad] skill located at ${skillsDir}`)
  }
}

/** Resolve the package root from this module's own location. */
function resolvePackageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  // src/locator.ts -> parent is the package root; lib/locator.js -> parent too.
  const candidate = dirname(here)
  return existsSync(join(candidate, 'package.json')) ? candidate : here
}

function resolveSkillsDir(): string {
  return join(resolvePackageRoot(), 'skills', 'dsh-math-olympiad')
}