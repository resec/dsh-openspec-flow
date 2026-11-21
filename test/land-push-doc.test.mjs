import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('the landed push document names the command, checks and recovery', () => {
  const doc = read('docs/land-push.md')
  for (const text of [
    'node scripts/push-landed.mjs',
    '--push',
    'origin',
    'openspec-flow/landed',
    'approvedBy',
    'featureTree',
    'archiveCommit',
    'landCommit',
    'mergeCommit',
    '--land',
    '--merge',
    'fast-forward',
    'legacy-merge',
    'npm run hooks:install',
    'Exit codes',
    'dry run',
    'cannot be regenerated',
    'unmatched',
    'ambiguous',
    'not an ancestor',
  ]) {
    assert.ok(doc.includes(text), `document names ${text}`)
  }
})

test('the landed push document is linked from every entry point', () => {
  for (const path of ['AGENTS.md', 'README.md', 'docs/apply-worktree.md', 'docs/apply-worktree-dev.md']) {
    assert.match(read(path), /land-push\.md/, `${path} links land-push.md`)
  }
})

test('README names the worktree land and the explicit push script', () => {
  const readme = read('README.md')
  assert.ok(readme.includes('openspec_apply_worktree action=land'), 'README names worktree land')
  assert.ok(readme.includes('scripts/push-landed.mjs'), 'README names the push script')
  assert.ok(readme.includes('docs/land-push.md'), 'README lists the push document')
})

test('package.json exposes the landed push command', () => {
  const manifest = JSON.parse(read('package.json'))
  assert.equal(manifest.scripts['push:landed'], 'node scripts/push-landed.mjs')
})
