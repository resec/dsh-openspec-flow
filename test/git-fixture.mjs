/**
 * Repository creation for test fixtures.
 *
 * `git` prefers an inherited `GIT_DIR` to the directory it runs in. A process
 * started from a git hook inherits one, and the fixture's `git init` would then
 * write the hook's repository and leave the fixture root without a `.git`. The
 * test entrypoints drop those variables; the assertion here covers a direct
 * `node --test` that bypasses them.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Run `git init` in a fixture root and assert the repository was created there.
 *
 * @param root - directory that must own the new repository.
 * @param args - arguments after `init`, such as `['-q', '-b', 'main']`.
 */
export function initFixtureRepo(root, args = []) {
  const result = spawnSync('git', ['-C', root, 'init', ...args], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const bare = args.includes('--bare')
  const marker = join(root, bare ? 'HEAD' : '.git')
  assert.ok(
    existsSync(marker) && (bare ? statSync(marker).isFile() : statSync(marker).isDirectory()),
    `fixture root ${root} has no standalone ${bare ? 'repository' : '.git'}: git init wrote to an inherited GIT_DIR`,
  )
}
