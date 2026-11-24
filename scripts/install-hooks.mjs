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
console.log('pre-push runs npm run openspec:check:push for a push targeting only refs/heads/main (validating main specs and archived tasks and requiring every active change to be in progress), or npm run openspec:check for another ref or a mixed push; after validation, a push that includes refs/heads/main runs node scripts/check-main-push.mjs on the main ref pair, refusing a direct worktree land and requiring the push-landed --offline marker for a recorded offline range; then node scripts/coverage-stamp.mjs check on .cache/coverage-stamp.json; a verified stamp skips npm run verify; it is invalidated by a missing or corrupt stamp, a dirty tree, a fingerprint mismatch, a moved merge base or a different Node version; COVERAGE_SKIP=1 skips only coverage. The reusable DSH lab scenarios run in the remote lab CI job for pull requests and main; the offline local path runs npm run test:lab -- --mock-only before landing.')
