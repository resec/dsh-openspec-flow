import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  assertPushRange,
  offlineLandsPath,
  readLandedManifests,
} from '../scripts/landed-push-guard.mjs'

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
 * Build an empty repository with one base commit.
 * @returns fixture facts.
 */
function makeRepository() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-landed-guard-'))
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test'])
  write(root, 'base.txt', 'base\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', 'base'])
  return { root, base: git(root, ['rev-parse', 'HEAD']) }
}

/**
 * Commit one file.
 * @param root - fixture root.
 * @param path - relative path.
 * @param text - content.
 * @param message - commit message.
 * @returns commit id.
 */
function commit(root, path, text, message) {
  write(root, path, text)
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', message])
  return git(root, ['rev-parse', 'HEAD'])
}

/**
 * Write a landed manifest for one change.
 * @param root - fixture root.
 * @param options - change, land and archive commits.
 */
function writeManifest(root, { change = 'add-x', land, archive }) {
  const tree = git(root, ['rev-parse', `${land}^{tree}`])
  write(root, `.git/openspec-flow/landed/${land}.json`, `${JSON.stringify({
    change,
    landCommit: land,
    archiveCommit: archive,
    featureTree: tree,
    approvedBy: 'user',
  }, null, 2)}\n`)
}

/**
 * Build one feature branch with a land commit and an archive commit.
 * @param options - number of reviewed commits.
 * @returns fixture facts.
 */
function makeLanded({ commits = 1 } = {}) {
  const repository = makeRepository()
  git(repository.root, ['checkout', '-q', '-b', 'feature'])
  let land = repository.base
  for (let index = 1; index <= commits; index += 1) {
    land = commit(repository.root, `feature-${index}.txt`, `feature ${index}\n`, `feature ${index}`)
  }
  const archive = commit(repository.root, 'openspec/changes/archive/add-x/proposal.md', '# Archive\n', 'archive')
  writeManifest(repository.root, { land, archive })
  return { ...repository, land, archive, tree: git(repository.root, ['rev-parse', `${land}^{tree}`]) }
}

/**
 * Write a landed-offline local owner entry.
 * @param root - fixture root.
 * @param tree - reviewed tree.
 */
function writeLocalPhase(root, tree) {
  write(root, '.cache/pr-review/local-prs.json', `${JSON.stringify({
    schemaVersion: 1,
    prs: {
      1: {
        number: 1,
        change: 'add-x',
        branch: 'pr/add-x',
        head: tree,
        tree,
        record: 'local#add-x',
        ownerSession: 'session-test',
        phase: 'landed-offline',
      },
    },
  }, null, 2)}\n`)
}

/**
 * Write an offline-land record.
 * @param root - fixture root.
 * @param facts - land, archive and tree.
 */
function writeOfflineRecord(root, { land, archive, tree }) {
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

/**
 * Remove a fixture repository.
 * @param root - fixture root.
 */
function cleanup(root) {
  rmSync(root, { recursive: true, force: true })
}

test('a merged land pushes only its archive commit', () => {
  const fixture = makeLanded()
  try {
    const result = assertPushRange({ root: fixture.root, base: fixture.land, tip: fixture.archive })
    assert.deepEqual(result, { checked: 1, allowed: true })
    assert.equal(readLandedManifests(fixture.root).length, 1)
  } finally {
    cleanup(fixture.root)
  }
})

test('a direct land is refused', () => {
  const fixture = makeLanded()
  try {
    assert.throws(
      () => assertPushRange({ root: fixture.root, base: fixture.base, tip: fixture.archive }),
      /land commit .* is not on origin\/main.*pr-publish/,
    )
  } finally {
    cleanup(fixture.root)
  }
})

test('a multi-commit reviewed branch is allowed with an offline record', () => {
  const fixture = makeLanded({ commits: 3 })
  try {
    writeOfflineRecord(fixture.root, { land: fixture.land, archive: fixture.archive, tree: fixture.tree })
    const result = assertPushRange({
      root: fixture.root,
      base: fixture.base,
      tip: fixture.archive,
      allowOffline: true,
    })
    assert.deepEqual(result, { checked: 1, allowed: true })
  } finally {
    cleanup(fixture.root)
  }
})

test('an offline record without the flag is refused', () => {
  const fixture = makeLanded()
  try {
    writeOfflineRecord(fixture.root, { land: fixture.land, archive: fixture.archive, tree: fixture.tree })
    assert.throws(
      () => assertPushRange({ root: fixture.root, base: fixture.base, tip: fixture.archive }),
      /has a recorded offline land; run `node scripts\/push-landed\.mjs --push --offline`/,
    )
  } finally {
    cleanup(fixture.root)
  }
})

test('a landed-offline local phase is allowed with the flag', () => {
  const fixture = makeLanded()
  try {
    writeLocalPhase(fixture.root, fixture.tree)
    const result = assertPushRange({
      root: fixture.root,
      base: fixture.base,
      tip: fixture.archive,
      allowOffline: true,
    })
    assert.deepEqual(result, { checked: 1, allowed: true })
  } finally {
    cleanup(fixture.root)
  }
})

test('an earlier direct land in the range is refused even when the selected land is merged', () => {
  const fixture = makeRepository()
  try {
    git(fixture.root, ['checkout', '-q', '-b', 'side'])
    const side = commit(fixture.root, 'side.txt', 'side\n', 'side land')
    git(fixture.root, ['checkout', '-q', 'main'])
    const selected = commit(fixture.root, 'selected.txt', 'selected\n', 'selected land')
    const archive = commit(fixture.root, 'openspec/changes/archive/selected/proposal.md', '# Archive\n', 'archive selected')
    writeManifest(fixture.root, { change: 'selected', land: selected, archive })
    writeManifest(fixture.root, { change: 'side', land: side, archive: side })
    git(fixture.root, ['merge', '-q', '--no-ff', '-m', 'merge side', 'side'])
    const merge = git(fixture.root, ['rev-parse', 'HEAD'])
    assert.throws(
      () => assertPushRange({ root: fixture.root, base: selected, tip: merge }),
      /land commit .* for change side \(manifest .*\) is not on origin\/main/,
    )
  } finally {
    cleanup(fixture.root)
  }
})

test('a plain non-worktree commit does not block a merged land', () => {
  const fixture = makeLanded()
  try {
    const plain = commit(fixture.root, 'notes.txt', 'notes\n', 'non-worktree change')
    const result = assertPushRange({ root: fixture.root, base: fixture.land, tip: plain })
    assert.deepEqual(result, { checked: 1, allowed: true })
  } finally {
    cleanup(fixture.root)
  }
})
