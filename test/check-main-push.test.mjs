import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import { main } from '../scripts/check-main-push.mjs'
import { offlineLandsPath } from '../scripts/landed-push-guard.mjs'

/**
 * Run git in a fixture repository.
 * @param cwd - repository root.
 * @param args - git arguments.
 * @returns trimmed stdout.
 */
function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

/**
 * Write a file under the fixture root.
 * @param root - fixture root.
 * @param path - relative path.
 * @param text - content.
 */
function write(root, path, text) {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), text)
}

/**
 * Build a repository with a local archive commit and a chosen remote main.
 * @param options - whether the land commit is on the remote and whether to record it offline.
 * @returns fixture facts.
 */
function makeFixture({ remoteLand = false, offlineRecord = false, manifest = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-check-main-push-'))
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test'])
  write(root, '.gitignore', '.cache/\n')
  write(root, 'base.txt', 'base\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', 'base'])
  const base = git(root, ['rev-parse', 'HEAD'])
  const origin = join(root, '..', `${root.split('/').pop()}-origin.git`)
  git(root, ['init', '--bare', '-q', origin])
  git(root, ['remote', 'add', 'origin', origin])
  git(root, ['push', '-q', '-u', 'origin', 'main'])

  const land = (() => {
    write(root, 'feature.txt', 'feature\n')
    git(root, ['add', '.'])
    git(root, ['commit', '-qm', 'feature'])
    return git(root, ['rev-parse', 'HEAD'])
  })()
  const tree = git(root, ['rev-parse', `${land}^{tree}`])
  write(root, 'openspec/changes/archive/add-x/proposal.md', '# Archive\n')
  git(root, ['add', '-A', '--', 'openspec/changes'])
  git(root, ['commit', '-qm', 'archive'])
  const archive = git(root, ['rev-parse', 'HEAD'])
  if (remoteLand) git(root, ['push', '-q', 'origin', `${land}:refs/heads/main`])
  if (manifest) {
    write(root, `.git/openspec-flow/landed/${land}.json`, `${JSON.stringify({
      change: 'add-x',
      landCommit: land,
      archiveCommit: archive,
      featureTree: tree,
      approvedBy: 'user',
    }, null, 2)}\n`)
  }
  if (offlineRecord) {
    write(root, `.cache/pr-review/${offlineLandsPath(root).split('/').pop()}`, `${JSON.stringify({
      schemaVersion: 1,
      lands: {
        [land]: {
          change: 'add-x',
          archiveCommit: archive,
          featureTree: tree,
          session: 'session-test',
          recordedAt: '2026-11-24T12:00:00.000Z',
        },
      },
    }, null, 2)}\n`)
  }
  return { root, origin, base, land, archive, tree }
}

/**
 * Run the check with captured output.
 * @param options - fixture, offline marker and commit pair.
 * @returns exit code and output.
 */
function check({ root, local, remote, offline = false }) {
  let stdout = ''
  let stderr = ''
  const code = main([local, remote], { cwd: root, offline, stdout: (text) => { stdout += text }, stderr: (text) => { stderr += text } })
  return { code, stdout, stderr }
}

/**
 * Remove a fixture.
 * @param fixture - fixture facts.
 */
function cleanup(fixture) {
  rmSync(fixture.root, { recursive: true, force: true })
  rmSync(fixture.origin, { recursive: true, force: true })
}

test('a merged land passes and a direct land is refused', () => {
  const merged = makeFixture({ remoteLand: true })
  try {
    assert.equal(check({ root: merged.root, local: merged.archive, remote: merged.land }).code, 0)
  } finally {
    cleanup(merged)
  }

  const direct = makeFixture()
  try {
    const result = check({ root: direct.root, local: direct.archive, remote: direct.base })
    assert.equal(result.code, 1)
    assert.match(result.stderr, /not on origin\/main/)
  } finally {
    cleanup(direct)
  }
})

test('a raw offline push is refused and the marker allows it', () => {
  const fixture = makeFixture({ offlineRecord: true })
  try {
    const raw = check({ root: fixture.root, local: fixture.archive, remote: fixture.base })
    assert.equal(raw.code, 1)
    assert.match(raw.stderr, /node scripts\/push-landed\.mjs --push --offline/)
    const marked = check({ root: fixture.root, local: fixture.archive, remote: fixture.base, offline: true })
    assert.equal(marked.code, 0)
  } finally {
    cleanup(fixture)
  }
})

test('a non-worktree range passes and a deletion is allowed', () => {
  const plain = makeFixture({ manifest: false, remoteLand: true })
  try {
    assert.equal(check({ root: plain.root, local: plain.archive, remote: plain.land }).code, 0)
    assert.equal(check({ root: plain.root, local: '0'.repeat(40), remote: plain.land }).code, 0)
  } finally {
    cleanup(plain)
  }
})

test('usage errors exit 2', () => {
  const run = (args) => main(args, { cwd: process.cwd(), stdout: () => {}, stderr: () => {} })
  assert.equal(run([]), 2)
  assert.equal(run(['bad', 'bad']), 2)
})
