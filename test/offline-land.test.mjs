import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { offlineLandsPath } from '../scripts/landed-push-guard.mjs'

const SCRIPT = fileURLToPath(new URL('../scripts/offline-land.mjs', import.meta.url))

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
 * Run the offline-land command.
 * @param cwd - fixture root.
 * @param args - command arguments.
 * @returns spawn result.
 */
function run(cwd, args = []) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' })
}

/**
 * Write one file under a fixture root.
 * @param root - fixture root.
 * @param path - relative path.
 * @param text - content.
 */
function write(root, path, text) {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), text)
}

/**
 * Build one offline-landed fixture: local main reaches the archive commit while origin/main stays at the base.
 * @returns fixture facts.
 */
function makeOfflineLand() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-offline-land-'))
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test'])
  write(root, '.gitignore', '.cache/\n')
  write(root, 'openspec/changes/add-x/proposal.md', '# Add X\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', 'initial'])
  const initial = git(root, ['rev-parse', 'HEAD'])
  const origin = join(root, '..', `${root.split('/').pop()}-origin.git`)
  git(root, ['init', '--bare', '-q', origin])
  git(root, ['remote', 'add', 'origin', origin])
  git(root, ['push', '-q', '-u', 'origin', 'main'])

  git(root, ['checkout', '-q', '-b', 'feature'])
  write(root, 'src/app.txt', 'app\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', 'feature'])
  git(root, ['checkout', '-q', 'main'])
  git(root, ['merge', '-q', '--ff-only', 'feature'])
  const land = git(root, ['rev-parse', 'HEAD'])
  const featureTree = git(root, ['rev-parse', `${land}^{tree}`])

  const archiveDirectory = join(root, 'openspec/changes/archive/2026-11-20-add-x')
  mkdirSync(archiveDirectory, { recursive: true })
  renameSync(join(root, 'openspec/changes/add-x/proposal.md'), join(archiveDirectory, 'proposal.md'))
  rmSync(join(root, 'openspec/changes/add-x'), { recursive: true, force: true })
  git(root, ['add', '-A', '--', 'openspec/changes'])
  git(root, ['commit', '-qm', 'archive add-x'])
  const archive = git(root, ['rev-parse', 'HEAD'])

  const manifest = {
    change: 'add-x',
    store: null,
    worktree: join(root, '.cache', 'openspec-flow', 'worktrees', 'local#add-x'),
    branch: 'openspec/apply/local-add-x',
    featureHead: land,
    featureTree,
    landCommit: land,
    mainHead: archive,
    archiveCommit: archive,
    applyReviewId: null,
    reviewRecordHash: null,
    approvedBy: 'user',
    landedAt: '2026-11-20T12:00:00.000Z',
  }
  const manifestFile = join(root, '.git/openspec-flow/landed', `${land}.json`)
  mkdirSync(join(manifestFile, '..'), { recursive: true })
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
  return { root, origin, initial, land, archive, featureTree, manifest, manifestFile }
}

/**
 * Write a local owner entry.
 * @param root - fixture root.
 * @param phase - local phase.
 * @param tree - reviewed tree.
 */
function writeLocalPhase(root, phase, tree) {
  write(root, '.cache/pr-review/local-prs.json', `${JSON.stringify({
    schemaVersion: 1,
    prs: {
      7: {
        number: 7,
        change: 'add-x',
        branch: 'pr/add-x',
        head: tree,
        tree,
        record: 'local#add-x',
        ownerSession: 'session-test',
        phase,
      },
    },
  }, null, 2)}\n`)
}

/**
 * Read the offline-land state.
 * @param root - fixture root.
 * @returns parsed state, or undefined.
 */
function readState(root) {
  const file = offlineLandsPath(root)
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined
}

/**
 * Remove a fixture.
 * @param fixture - fixture facts.
 */
function cleanup(fixture) {
  rmSync(fixture.root, { recursive: true, force: true })
  rmSync(fixture.origin, { recursive: true, force: true })
}

test('record writes the offline land without pushing', () => {
  const fixture = makeOfflineLand()
  try {
    const result = run(fixture.root, ['record', '--change', 'add-x', '--land', fixture.land, '--session', 'session-test', '--apply'])
    assert.equal(result.status, 0, result.stderr)
    const state = readState(fixture.root)
    assert.equal(state.schemaVersion, 1)
    const record = state.lands[fixture.land]
    assert.equal(record.change, 'add-x')
    assert.equal(record.archiveCommit, fixture.archive)
    assert.equal(record.featureTree, fixture.featureTree)
    assert.equal(record.session, 'session-test')
    assert.equal(git(fixture.root, ['ls-remote', '--heads', 'origin', 'main']).split(/\s+/u)[0], fixture.initial)
  } finally {
    cleanup(fixture)
  }
})

test('the default is a dry run and writes nothing', () => {
  const fixture = makeOfflineLand()
  try {
    const result = run(fixture.root, ['record', '--change', 'add-x', '--land', fixture.land])
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /"dryRun": true/)
    assert.equal(readState(fixture.root), undefined)
  } finally {
    cleanup(fixture)
  }
})

test('a matching record is idempotent and a mismatched record is refused', () => {
  const fixture = makeOfflineLand()
  try {
    const first = run(fixture.root, ['record', '--change', 'add-x', '--land', fixture.land, '--apply'])
    assert.equal(first.status, 0, first.stderr)
    const again = run(fixture.root, ['record', '--change', 'add-x', '--land', fixture.land, '--apply'])
    assert.equal(again.status, 0, again.stderr)

    const state = readState(fixture.root)
    state.lands[fixture.land].featureTree = 'a'.repeat(40)
    writeFileSync(offlineLandsPath(fixture.root), `${JSON.stringify(state, null, 2)}\n`)
    const mismatch = run(fixture.root, ['record', '--change', 'add-x', '--land', fixture.land, '--apply'])
    assert.equal(mismatch.status, 1)
    assert.match(mismatch.stderr, /different offline-land record/)
  } finally {
    cleanup(fixture)
  }
})

test('a stale land selector is refused without writing', () => {
  const fixture = makeOfflineLand()
  try {
    const result = run(fixture.root, ['record', '--change', 'add-x', '--land', 'f'.repeat(40), '--apply'])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /no landed manifest has land commit/)
    assert.equal(readState(fixture.root), undefined)
  } finally {
    cleanup(fixture)
  }
})

test('a local published entry is refused and a landed-offline entry is accepted', () => {
  const fixture = makeOfflineLand()
  try {
    writeLocalPhase(fixture.root, 'published', fixture.featureTree)
    const published = run(fixture.root, ['record', '--change', 'add-x', '--land', fixture.land, '--apply'])
    assert.equal(published.status, 1)
    assert.match(published.stderr, /is published; finish the online flow/)

    writeLocalPhase(fixture.root, 'landed-offline', fixture.featureTree)
    const offline = run(fixture.root, ['record', '--change', 'add-x', '--land', fixture.land, '--session', 'session-test', '--apply'])
    assert.equal(offline.status, 0, offline.stderr)
    assert.equal(readState(fixture.root).lands[fixture.land].change, 'add-x')
  } finally {
    cleanup(fixture)
  }
})
