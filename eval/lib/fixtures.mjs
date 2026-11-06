/**
 * Deterministic fixture preparation.
 *
 * A synthetic fixture is copied from `eval/fixtures/<id>/template/`. A real
 * fixture is extracted from a pinned commit with `git archive`, so the target
 * change and the reference implementation are absent from the working tree.
 *
 * @module eval/lib/fixtures
 */

import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  readFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { installSkills } from '../../lib/skills.js'
import { FIXTURES_ROOT, REPO_ROOT, OPENSPEC_BIN } from './paths.mjs'
import { fixtureDir, requestPath } from './registry.mjs'

const SKILL_NAMES = [
  'openspec-explore',
  'openspec-propose',
  'openspec-apply-change',
  'openspec-archive-change',
  'openspec-sync-specs',
  'openspec-update-change',
]
const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`)
  }
  return result
}

function replaceSkills(destination, source) {
  const target = join(destination, '.dsh', 'skills')
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    cpSync(join(source, entry.name), join(target, entry.name), { recursive: true })
  }
}

/**
 * Generate and cache the official skills with the pinned CLI.
 * @param options - cache directory and CLI binary.
 * @returns the cache directory.
 */
export function ensureOfficialSkills({ cacheDir, openspecBin = OPENSPEC_BIN }) {
  const marker = join(cacheDir, 'openspec-apply-change', 'SKILL.md')
  if (existsSync(marker)) return cacheDir
  const temp = mkdtempSync(join(tmpdir(), 'eval-official-'))
  try {
    run(openspecBin, ['init', '--tools', 'dsh', '--no-animation'], {
      cwd: temp,
      env: { ...process.env, OPENSPEC_TELEMETRY: '0', OPENSPEC_NO_UPDATE_CHECK: '1' },
    })
    rmSync(cacheDir, { recursive: true, force: true })
    mkdirSync(dirname(cacheDir), { recursive: true })
    cpSync(join(temp, '.dsh', 'skills'), cacheDir, { recursive: true })
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
  return cacheDir
}

function extractGitFixture(fixture, destination) {
  mkdirSync(destination, { recursive: true })
  const archive = spawnSync('git', ['archive', '--format=tar', fixture.baseCommit], {
    cwd: REPO_ROOT,
    maxBuffer: 128 * 1024 * 1024,
  })
  if (archive.status !== 0) {
    throw new Error(`git archive ${fixture.baseCommit} failed: ${archive.stderr ?? ''}`)
  }
  const tarPath = join(destination, '..', `${fixture.id}.tar`)
  writeFileSync(tarPath, archive.stdout)
  try {
    run('tar', ['-xf', tarPath, '-C', destination])
  } finally {
    rmSync(tarPath, { force: true })
  }
}

function copySyntheticFixture(fixture, destination) {
  const template = join(fixtureDir(fixture), 'template')
  mkdirSync(destination, { recursive: true })
  cpSync(template, destination, { recursive: true })
}

function initGit(destination, date = FIXED_DATE) {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Eval Fixture',
    GIT_AUTHOR_EMAIL: 'eval@example.invalid',
    GIT_COMMITTER_NAME: 'Eval Fixture',
    GIT_COMMITTER_EMAIL: 'eval@example.invalid',
    GIT_AUTHOR_DATE: date.toISOString(),
    GIT_COMMITTER_DATE: date.toISOString(),
  }
  run('git', ['init', '-b', 'main'], { cwd: destination, env })
  mkdirSync(join(destination, '.git', 'info'), { recursive: true })
  writeFileSync(join(destination, '.git', 'info', 'exclude'), 'node_modules\n')
  run('git', ['add', '-A'], { cwd: destination, env })
  run('git', ['-c', 'user.name=Eval Fixture', '-c', 'user.email=eval@example.invalid', 'commit', '-m', 'fixture base'], {
    cwd: destination,
    env,
  })
  return run('git', ['rev-parse', 'HEAD'], { cwd: destination }).stdout.trim()
}

function copyNodeModules(destination) {
  const target = join(destination, 'node_modules')
  if (existsSync(target)) return
  const source = join(REPO_ROOT, 'node_modules')
  const result = spawnSync('cp', ['-al', source, target], { encoding: 'utf8' })
  if (result.status !== 0) cpSync(source, target, { recursive: true })
}

function prepareProbe(destination) {
  const source = join(FIXTURES_ROOT, 'probe', 'proj', 'openspec')
  if (!existsSync(source)) throw new Error(`probe fixture is missing: ${source}`)
  const probeRoot = join(destination, '..', '.probe', 'proj')
  rmSync(join(destination, '..', '.probe'), { recursive: true, force: true })
  mkdirSync(probeRoot, { recursive: true })
  cpSync(source, join(probeRoot, 'openspec'), { recursive: true })
}

export function fixtureTestTargets(destination) {
  const testDir = join(destination, 'test')
  const targets = readdirSync(testDir)
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => join('test', name))
  if (targets.length === 0) throw new Error(`fixture has no test files: ${testDir}`)
  return targets
}

function runBaseTests(destination) {
  const env = { ...process.env, OPENSPEC_TELEMETRY: '0', OPENSPEC_NO_UPDATE_CHECK: '1' }
  delete env.NODE_TEST_CONTEXT
  const targets = fixtureTestTargets(destination)
  const result = spawnSync('node', ['--test', ...targets], {
    cwd: destination,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
    env,
  })
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.slice(-2000)
    throw new Error(`fixture base tests failed before the run:\n${detail}`)
  }
}

/**
 * Move unrelated in-flight changes out of the working tree.
 *
 * A base commit can contain a change that was never archived. It is real
 * history, but it is not the target of this run and must not steer stage
 * detection or the model. Preserve it under the archive instead of deleting it.
 *
 * @param destination - prepared fixture tree.
 * @param expectedName - the change the request asks for.
 */
function archiveUnrelatedChanges(destination, expectedName) {
  const root = join(destination, 'openspec', 'changes')
  if (!existsSync(root)) return
  const archiveRoot = join(root, 'archive')
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'archive' || entry.name === expectedName) continue
    mkdirSync(archiveRoot, { recursive: true })
    renameSync(join(root, entry.name), join(archiveRoot, `2026-01-01-${entry.name}`))
  }
}

/**
 * Fail when the target change is already present.
 * @param destination - fixture tree.
 * @param changeName - target change name.
 */
export function assertNoTargetChange(destination, changeName) {
  const active = join(destination, 'openspec', 'changes', changeName)
  if (existsSync(active)) {
    throw new Error(`fixture leaks the target change: ${active}`)
  }
  const archive = join(destination, 'openspec', 'changes', 'archive')
  if (existsSync(archive)) {
    const leaked = readdirSync(archive).find(
      (name) => name === changeName || name.endsWith(`-${changeName}`),
    )
    if (leaked !== undefined) {
      throw new Error(`fixture leaks the archived target change: ${leaked}`)
    }
  }
}

/**
 * Absolute paths of the acceptance files a run must hide.
 * @param fixture - fixture manifest.
 * @returns target paths under the fixture's `test/`.
 */
export function acceptanceTargets(fixture) {
  const source = join(fixtureDir(fixture), 'acceptance')
  if (!existsSync(source)) return []
  return readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join('test', entry.name))
}

/**
 * Assert that hidden acceptance is absent from a prepared fixture.
 * @param fixture - fixture manifest.
 * @param destination - fixture tree.
 */
export function assertAcceptanceHidden(fixture, destination) {
  for (const relative of acceptanceTargets(fixture)) {
    if (existsSync(join(destination, relative))) {
      throw new Error(`hidden acceptance is present before the run: ${relative}`)
    }
  }
}

/**
 * Copy hidden acceptance into a fixture after the run.
 * @param fixture - fixture manifest.
 * @param destination - fixture tree.
 * @returns absolute paths of the injected files.
 */
export function injectAcceptance(fixture, destination) {
  const source = join(fixtureDir(fixture), 'acceptance')
  const paths = []
  for (const relative of acceptanceTargets(fixture)) {
    const target = join(destination, relative)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(join(source, relative.replace(/^test\//u, '')), target, { recursive: false })
    paths.push(target)
  }
  return paths
}

/**
 * Prepare one fixture for one arm.
 * @param options - fixture, arm, destination, official skills and repository root.
 * @returns preparation metadata.
 */
export function prepareFixture({
  fixture,
  arm,
  destination,
  officialSkillsDir = null,
  repoRoot = REPO_ROOT,
  date = FIXED_DATE,
}) {
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(destination, { recursive: true })

  if (fixture.kind === 'synthetic') {
    copySyntheticFixture(fixture, destination)
  } else {
    extractGitFixture(fixture, destination)
  }
  rmSync(join(destination, '.git'), { recursive: true, force: true })
  archiveUnrelatedChanges(destination, fixture.changeName)
  if (fixture.kind === 'git') {
    prepareProbe(destination)
    copyNodeModules(destination)
  }
  assertNoTargetChange(destination, fixture.changeName)
  assertAcceptanceHidden(fixture, destination)

  if (arm === 'official') {
    if (typeof officialSkillsDir !== 'string') {
      throw new Error('officialSkillsDir is required for the official arm')
    }
    replaceSkills(destination, officialSkillsDir)
  } else if (fixture.skillSource === 'fixture') {
    replaceSkills(destination, join(destination, 'skills'))
  } else {
    installSkills(destination, { now: date })
    rmSync(join(destination, '.dsh', 'openspec-flow-backup'), { recursive: true, force: true })
  }

  runBaseTests(destination)
  const commit = initGit(destination, date)
  return {
    fixtureId: fixture.id,
    arm,
    destination,
    commit,
    request: readFileSync(requestPath(fixture), 'utf8'),
    skills: fixture.skillSource,
  }
}

/**
 * Find the active change a run created.
 * @param destination - fixture tree.
 * @param expected - the change name from the request.
 * @returns the change name or null.
 */
export function findChange(destination, expected) {
  const root = join(destination, 'openspec', 'changes')
  if (!existsSync(root)) return null
  const names = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive')
    .map((entry) => entry.name)
  if (expected && names.includes(expected)) return expected
  return names[0] ?? null
}

/**
 * List the skill names installed in a fixture.
 * @param destination - fixture tree.
 * @returns sorted skill names.
 */
export function installedSkills(destination) {
  const root = join(destination, '.dsh', 'skills')
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && SKILL_NAMES.includes(entry.name))
    .map((entry) => entry.name)
    .sort()
}

export { SKILL_NAMES }
