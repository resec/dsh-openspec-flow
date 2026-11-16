#!/usr/bin/env node
/**
 * Point Git at the repository's checked-in hooks.
 *
 * The installer is explicit: it never runs from postinstall and never changes
 * a user's global Git configuration.
 */

import { chmodSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const hook = join(ROOT, '.githooks', 'pre-push')

if (!existsSync(hook)) {
  console.error('pre-push gate: .githooks/pre-push is missing')
  process.exit(1)
}

try {
  chmodSync(hook, 0o755)
} catch {
  // File modes are not meaningful on every platform; Git Bash still runs the hook.
}

const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
  cwd: ROOT,
  stdio: 'inherit',
})

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
console.log('pre-push gate: core.hooksPath=.githooks installed')
console.log('pre-push runs npm run openspec:check, then node scripts/coverage-stamp.mjs check; a verified stamp skips npm run verify; COVERAGE_SKIP=1 skips coverage.')
