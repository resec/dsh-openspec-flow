import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const SCRIPT = fileURLToPath(new URL('../scripts/push-landed.mjs', import.meta.url))

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function run(cwd, args = []) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' })
}

function write(path, text) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
}

function makeRepository() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-push-landed-'))
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test'])
  write(join(root, 'openspec', 'changes', 'add-x', 'proposal.md'), '# Add X\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', 'initial'])
  const initial = git(root, ['rev-parse', 'HEAD'])
  const origin = join(root, '..', `${root.split('/').pop()}-origin.git`)
  git(root, ['init', '--bare', '-q', origin])
  // A bare repository inherits `init.defaultBranch` for HEAD, so deleting `main`
  // would be refused on a host that defaults to it. Point HEAD at a branch that
  // is never pushed so the missing-main scenario does not depend on host config.
  git(origin, ['symbolic-ref', 'HEAD', 'refs/heads/trunk'])
  // Pin the property the fixture depends on: a bare repository whose HEAD is
  // `main` refuses the deletion whatever `init.defaultBranch` was on the host,
  // so on such a host dropping the line above would keep every test green while
  // the missing-main scenario silently stopped exercising the refusal it names.
  assert.notEqual(git(origin, ['symbolic-ref', 'HEAD']), 'refs/heads/main')
  git(root, ['remote', 'add', 'origin', origin])
  git(root, ['push', '-q', '-u', 'origin', 'main'])
  return { root, origin, initial }
}

function makeLanded({ change = 'add-x', legacy = false } = {}) {
  const repository = makeRepository()
  const { root, origin } = repository
  git(root, ['checkout', '-q', '-b', 'feature'])
  write(join(root, 'src', 'app.txt'), 'app\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', 'feature'])
  git(root, ['checkout', '-q', 'main'])
  if (legacy) {
    git(root, ['merge', '-q', '--no-ff', '-m', 'merge feature', 'feature'])
  } else {
    git(root, ['merge', '-q', '--ff-only', 'feature'])
  }
  const landCommit = git(root, ['rev-parse', 'HEAD'])
  const featureTree = git(root, ['rev-parse', `${landCommit}^{tree}`])

  const changeDirectory = join(root, 'openspec', 'changes', change)
  const archiveDirectory = join(root, 'openspec', 'changes', 'archive', `2026-11-20-${change}`)
  mkdirSync(archiveDirectory, { recursive: true })
  renameSync(join(changeDirectory, 'proposal.md'), join(archiveDirectory, 'proposal.md'))
  rmSync(changeDirectory, { recursive: true, force: true })
  write(join(root, 'openspec', 'specs', 'development-workflow', 'spec.md'), '# Dev\n')
  git(root, ['add', '-A', '--', 'openspec/changes', 'openspec/specs'])
  git(root, ['commit', '-qm', `archive ${change}`])
  const archiveCommit = git(root, ['rev-parse', 'HEAD'])

  const manifest = {
    change,
    store: null,
    worktree: join(root, '.cache', 'openspec-flow', 'worktrees', `local#${change}`),
    branch: `openspec/apply/local-${change}`,
    featureHead: landCommit,
    featureTree,
    landCommit,
    mainHead: archiveCommit,
    archiveCommit,
    applyReviewId: null,
    reviewRecordHash: null,
    approvedBy: 'user',
    landedAt: '2026-11-20T12:00:00.000Z',
  }
  if (legacy) {
    manifest.mergeCommit = landCommit
    delete manifest.landCommit
  }
  const manifestFile = writeManifest(root, manifest)
  return { ...repository, root, origin, change, landCommit, archiveCommit, featureTree, manifest, manifestFile }
}

function writeManifest(root, manifest) {
  const directory = join(root, '.git', 'openspec-flow', 'landed')
  mkdirSync(directory, { recursive: true })
  const commit = manifest.landCommit ?? manifest.mergeCommit
  const file = join(directory, `${commit}.json`)
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
  return file
}

function remoteMain(repository) {
  return git(repository.root, ['ls-remote', '--heads', 'origin', 'main']).split(/\s+/u)[0]
}

function cleanup(repository) {
  rmSync(repository.root, { recursive: true, force: true })
  rmSync(repository.origin, { recursive: true, force: true })
}

test('dry run reports the latest manifest and leaves the remote unchanged', () => {
  const repository = makeLanded()
  try {
    const before = remoteMain(repository)
    const result = run(repository.root)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /push-landed: manifest/)
    assert.match(result.stdout, /action: dry-run/)
    assert.equal(remoteMain(repository), before)
  } finally {
    cleanup(repository)
  }
})

test('a legacy mergeCommit manifest is selected by --merge and --land', () => {
  const repository = makeLanded({ legacy: true })
  try {
    for (const args of [['--merge', repository.landCommit.slice(0, 8)], ['--land', repository.landCommit.slice(0, 8)]]) {
      const result = run(repository.root, args)
      assert.equal(result.status, 0, result.stderr)
      assert.match(result.stdout, new RegExp(`land: ${repository.landCommit}`))
    }
  } finally {
    cleanup(repository)
  }
})

test('--push advances origin and a second run is idempotent', () => {
  const repository = makeLanded()
  try {
    const local = git(repository.root, ['rev-parse', 'HEAD'])
    const pushed = run(repository.root, ['--push'])
    assert.equal(pushed.status, 0, pushed.stderr)
    assert.equal(remoteMain(repository), local)
    const again = run(repository.root, ['--push'])
    assert.equal(again.status, 0, again.stderr)
    assert.match(again.stdout, /already pushed/)
  } finally {
    cleanup(repository)
  }
})

test('a dirty file outside the change tree is refused', () => {
  const repository = makeLanded()
  try {
    write(join(repository.root, 'notes.txt'), 'dirty\n')
    const result = run(repository.root, ['--push'])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /not clean/)
    assert.match(result.stderr, /notes\.txt/)
  } finally {
    cleanup(repository)
  }
})

test('another change planning file is ignored and the own change directory is refused', () => {
  const repository = makeLanded()
  try {
    write(join(repository.root, 'openspec', 'changes', 'other', 'proposal.md'), '# Other\n')
    const allowed = run(repository.root, ['--push'])
    assert.equal(allowed.status, 0, allowed.stderr)

    const own = makeLanded()
    try {
      write(join(own.root, 'openspec', 'changes', 'add-x', 'proposal.md'), '# Recreated\n')
      const refused = run(own.root, ['--push'])
      assert.equal(refused.status, 1)
      assert.match(refused.stderr, /openspec\/changes\/add-x\//)
    } finally {
      cleanup(own)
    }
  } finally {
    cleanup(repository)
  }
})

test('a non-main branch and a non-user approval are refused', () => {
  const repository = makeLanded()
  try {
    git(repository.root, ['checkout', '-q', '-b', 'subject'])
    const branch = run(repository.root, ['--push'])
    assert.equal(branch.status, 1)
    assert.match(branch.stderr, /not main/)
    git(repository.root, ['checkout', '-q', 'main'])

    repository.manifest.approvedBy = 'agent'
    writeManifest(repository.root, repository.manifest)
    const approval = run(repository.root, ['--push'])
    assert.equal(approval.status, 1)
    assert.match(approval.stderr, /not approved by the user/)
  } finally {
    cleanup(repository)
  }
})

test('a land tree mismatch and an archive path outside the change are refused', () => {
  const repository = makeLanded()
  try {
    repository.manifest.featureTree = git(repository.root, ['rev-parse', 'HEAD^{tree}'])
    writeManifest(repository.root, repository.manifest)
    const tree = run(repository.root, ['--push'])
    assert.equal(tree.status, 1)
    assert.match(tree.stderr, /does not match the reviewed featureTree/)

    const extra = makeLanded()
    try {
      write(join(extra.root, 'src', 'evil.txt'), 'evil\n')
      git(extra.root, ['add', 'src/evil.txt'])
      git(extra.root, ['commit', '-q', '--amend', '--no-edit'])
      extra.manifest.archiveCommit = git(extra.root, ['rev-parse', 'HEAD'])
      extra.manifest.mainHead = extra.manifest.archiveCommit
      writeManifest(extra.root, extra.manifest)
      const diff = run(extra.root, ['--push'])
      assert.equal(diff.status, 1)
      assert.match(diff.stderr, /src\/evil\.txt/)
    } finally {
      cleanup(extra)
    }
  } finally {
    cleanup(repository)
  }
})

test('a HEAD beyond the selected archive is refused', () => {
  const repository = makeLanded()
  try {
    write(join(repository.root, 'later.txt'), 'later\n')
    git(repository.root, ['add', 'later.txt'])
    git(repository.root, ['commit', '-qm', 'later'])
    const result = run(repository.root, ['--push'])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /not the selected landed archiveCommit/)
  } finally {
    cleanup(repository)
  }
})

test('remote ahead, diverged and missing main are refused', () => {
  const ahead = makeLanded()
  try {
    git(ahead.root, ['checkout', '-q', '-b', 'remote-ahead', 'main'])
    write(join(ahead.root, 'remote.txt'), 'remote\n')
    git(ahead.root, ['add', 'remote.txt'])
    git(ahead.root, ['commit', '-qm', 'remote ahead'])
    git(ahead.root, ['push', '-q', 'origin', 'HEAD:main'])
    git(ahead.root, ['checkout', '-q', 'main'])
    const result = run(ahead.root, ['--push'])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /ahead of HEAD/)
  } finally {
    cleanup(ahead)
  }

  const diverged = makeLanded()
  try {
    git(diverged.root, ['checkout', '-q', '-b', 'remote-only', diverged.initial])
    write(join(diverged.root, 'remote.txt'), 'remote\n')
    git(diverged.root, ['add', 'remote.txt'])
    git(diverged.root, ['commit', '-qm', 'remote only'])
    git(diverged.root, ['push', '-q', 'origin', 'HEAD:main'])
    git(diverged.root, ['checkout', '-q', 'main'])
    const result = run(diverged.root, ['--push'])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /diverged/)
  } finally {
    cleanup(diverged)
  }

  const missing = makeLanded()
  try {
    git(missing.root, ['push', '-q', 'origin', '--delete', 'main'])
    const result = run(missing.root, ['--push'])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /cannot fetch origin main/)
  } finally {
    cleanup(missing)
  }
})

test('a failing pre-push hook blocks the push', () => {
  const repository = makeLanded()
  try {
    const hook = join(repository.root, '.git', 'hooks', 'pre-push')
    writeFileSync(hook, '#!/bin/sh\nexit 1\n')
    chmodSync(hook, 0o755)
    const before = remoteMain(repository)
    const result = run(repository.root, ['--push'])
    assert.equal(result.status, 1)
    assert.equal(remoteMain(repository), before)
  } finally {
    cleanup(repository)
  }
})

test('selection, missing manifests and usage errors are reported', () => {
  const repository = makeLanded()
  try {
    for (const args of [['--change', 'add-x'], ['--land', repository.landCommit.slice(0, 8)], ['--manifest', repository.manifestFile]]) {
      const selected = run(repository.root, args)
      assert.equal(selected.status, 0, selected.stderr)
    }

    const empty = mkdtempSync(join(tmpdir(), 'dsh-push-landed-empty-'))
    try {
      const emptyGit = join(empty, '.git', 'openspec-flow', 'landed')
      mkdirSync(emptyGit, { recursive: true })
      write(join(empty, 'openspec', 'changes', 'x', 'proposal.md'), '# X\n')
      git(empty, ['init', '-q', '-b', 'main'])
      git(empty, ['config', 'user.email', 'test@example.com'])
      git(empty, ['config', 'user.name', 'Test'])
      git(empty, ['add', '.'])
      git(empty, ['commit', '-qm', 'initial'])
      const missing = run(empty)
      assert.equal(missing.status, 1)
      assert.match(missing.stderr, /has no manifest/)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }

    const usage = run(repository.root, ['--unknown'])
    assert.equal(usage.status, 2)
    assert.match(usage.stderr, /unknown argument/)
  } finally {
    cleanup(repository)
  }
})

test('explicit selection bypasses a damaged sibling manifest', () => {
  const repository = makeLanded()
  try {
    const directory = join(repository.root, '.git', 'openspec-flow', 'landed')
    writeFileSync(join(directory, 'broken.json'), '{ not json\n')
    const defaultRun = run(repository.root)
    assert.equal(defaultRun.status, 1)
    assert.match(defaultRun.stderr, /cannot read landed manifest/)

    const explicit = run(repository.root, ['--manifest', repository.manifestFile])
    assert.equal(explicit.status, 0, explicit.stderr)

    const byChange = run(repository.root, ['--change', 'add-x'])
    assert.equal(byChange.status, 0, byChange.stderr)
    assert.match(byChange.stderr, /skipping unreadable manifest/)
  } finally {
    cleanup(repository)
  }
})

test('selection rejects unmatched and ambiguous records', () => {
  const repository = makeLanded()
  try {
    const directory = join(repository.root, '.git', 'openspec-flow', 'landed')
    const copy = join(directory, 'copy.json')
    writeFileSync(copy, readFileSync(repository.manifestFile))
    const ambiguousChange = run(repository.root, ['--change', 'add-x'])
    assert.equal(ambiguousChange.status, 1)
    assert.match(ambiguousChange.stderr, /more than one landed manifest/)
    const ambiguousLand = run(repository.root, ['--land', repository.landCommit])
    assert.equal(ambiguousLand.status, 1)
    assert.match(ambiguousLand.stderr, /ambiguous/)
    const unmatched = run(repository.root, ['--change', 'missing'])
    assert.equal(unmatched.status, 1)
    assert.match(unmatched.stderr, /no landed manifest has change/)
  } finally {
    cleanup(repository)
  }
})

test('manifest field and commit checks refuse malformed records', () => {
  const repository = makeLanded()
  try {
    const directory = join(repository.root, '.git', 'openspec-flow', 'landed')
    const missingField = { ...repository.manifest }
    delete missingField.featureTree
    const missingFile = join(directory, 'missing-field.json')
    writeFileSync(missingFile, `${JSON.stringify(missingField, null, 2)}\n`)
    const missing = run(repository.root, ['--manifest', missingFile])
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /has no featureTree/)

    const absentArchive = { ...repository.manifest, archiveCommit: 'a'.repeat(40) }
    const absentArchiveFile = join(directory, 'absent-archive.json')
    writeFileSync(absentArchiveFile, `${JSON.stringify(absentArchive, null, 2)}\n`)
    const absent = run(repository.root, ['--manifest', absentArchiveFile])
    assert.equal(absent.status, 1)
    assert.match(absent.stderr, /not a commit/)

    const absentLand = { ...repository.manifest, landCommit: 'b'.repeat(40) }
    const absentLandFile = join(directory, 'absent-land.json')
    writeFileSync(absentLandFile, `${JSON.stringify(absentLand, null, 2)}\n`)
    const absentLandResult = run(repository.root, ['--manifest', absentLandFile])
    assert.equal(absentLandResult.status, 1)
    assert.match(absentLandResult.stderr, /not a commit/)

    const conflicting = { ...repository.manifest, mergeCommit: 'c'.repeat(40) }
    const conflictingFile = join(directory, 'conflicting.json')
    writeFileSync(conflictingFile, `${JSON.stringify(conflicting, null, 2)}\n`)
    const conflictingResult = run(repository.root, ['--manifest', conflictingFile])
    assert.equal(conflictingResult.status, 1)
    assert.match(conflictingResult.stderr, /different landCommit and mergeCommit/)

    git(repository.root, ['checkout', '-q', '-b', 'side', repository.initial])
    write(join(repository.root, 'side.txt'), 'side\n')
    git(repository.root, ['add', 'side.txt'])
    git(repository.root, ['commit', '-qm', 'side'])
    const side = git(repository.root, ['rev-parse', 'HEAD'])
    const sideTree = git(repository.root, ['rev-parse', `${side}^{tree}`])
    git(repository.root, ['checkout', '-q', 'main'])
    const notAncestor = { ...repository.manifest, landCommit: side, featureTree: sideTree }
    const notAncestorFile = join(directory, 'not-ancestor.json')
    writeFileSync(notAncestorFile, `${JSON.stringify(notAncestor, null, 2)}\n`)
    const ancestor = run(repository.root, ['--manifest', notAncestorFile])
    assert.equal(ancestor.status, 1)
    assert.match(ancestor.stderr, /not an ancestor/)
  } finally {
    cleanup(repository)
  }
})

