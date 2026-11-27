/**
 * Build the draft seal commit on the change's apply branch.
 *
 * The seal is constructed with a temporary index so `main`'s `HEAD`, index and
 * working tree stay unchanged. The commit is attached to the apply branch and
 * a private ref that keeps the apply base reachable across a rebase.
 *
 * @module dsh-openspec-flow/worktree/seal
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyWorktreeBranch } from './create.js'
import { artifactFileHash, hashFiles } from '../review/object.js'
import { gitCommitPaths } from '../review/store.js'

/** Run git and return stdout, or throw. */
function git(cwd, args, options = {}) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', ...options })
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`)
  }
  return result.stdout
}

/** Whether git exits successfully. */
function gitOk(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).status === 0
}

/**
 * The private ref that pins a change's seal commit.
 * @param store - optional store id.
 * @param change - change name.
 * @returns the full ref name.
 */
export function sealRefName(store, change) {
  const branch = applyWorktreeBranch(store, change)
  const prefix = 'openspec/apply/'
  const name = branch.startsWith(prefix) ? branch.slice(prefix.length) : branch
  return `refs/openspec-flow/seal/${name}`
}

/**
 * The apply branch that carries the seal commit.
 * @param store - optional store id.
 * @param change - change name.
 * @returns the branch name.
 */
export function sealBranchName(store, change) {
  return applyWorktreeBranch(store, change)
}

/**
 * Build the seal commit from the working tree with a temporary index.
 * @param options - root, changePath, ignorePath, change, message.
 * @returns the commit SHA.
 */
export function buildSealCommit(options) {
  const { root, changePath, ignorePath, change } = options
  const directory = mkdtempSync(join(tmpdir(), 'openspec-flow-seal-'))
  const indexFile = join(directory, 'index')
  const env = { ...process.env, GIT_INDEX_FILE: indexFile }
  try {
    const head = git(root, ['rev-parse', 'HEAD']).trim()
    git(root, ['read-tree', 'HEAD'], { env })
    const paths = [changePath]
    if (ignorePath !== undefined) paths.push(ignorePath)
    git(root, ['add', '-A', '--', ...paths], { env })
    const tree = git(root, ['write-tree'], { env }).trim()
    const message = options.message ?? `docs(openspec): seal ${change} draft`
    return git(root, ['commit-tree', tree, '-p', head, '-m', message]).trim()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

/**
 * The files a seal commit changes against its parent.
 * @param root - project root.
 * @param commit - seal commit.
 * @returns changed paths, or undefined.
 */
export function sealChangedPaths(root, commit) {
  return gitCommitPaths(root, commit)
}

/** The all-zero object name `git update-index --index-info` removes a path with. */
const ZERO_SHA = '0'.repeat(40)

/**
 * Read the blob entries of a revision limited to the given paths.
 * @param root - project root.
 * @param rev - revision whose tree is read.
 * @param paths - repository-relative paths.
 * @returns a map from path to `{ mode, sha }`, or undefined.
 */
function treeEntries(root, rev, paths) {
  const result = spawnSync('git', ['-C', root, 'ls-tree', '-r', '-z', rev, '--', ...paths], { encoding: 'utf8' })
  if (result.status !== 0) return undefined
  const entries = new Map()
  for (const record of result.stdout.split('\0')) {
    if (record === '') continue
    const tab = record.indexOf('\t')
    if (tab < 0) return undefined
    const [mode, type, sha] = record.slice(0, tab).split(' ')
    if (mode === undefined || type !== 'blob' || sha === undefined) return undefined
    entries.set(record.slice(tab + 1), { mode, sha })
  }
  return entries
}

/**
 * Whether a written tree carries exactly the seal's entries on its paths.
 * @param root - project root.
 * @param tree - written tree.
 * @param paths - the seal's changed paths.
 * @param sealEntries - the seal's entries by path.
 * @returns true when every path matches, including removals.
 */
function sealEntriesMatch(root, tree, paths, sealEntries) {
  const written = treeEntries(root, tree, paths)
  if (written === undefined) return false
  for (const path of paths) {
    const expected = sealEntries.get(path)
    const actual = written.get(path)
    if (expected === undefined) {
      if (actual !== undefined) return false
      continue
    }
    if (actual === undefined) return false
    if (actual.mode !== expected.mode || actual.sha !== expected.sha) return false
  }
  return true
}

/**
 * Whether a written tree differs from the fork only on the seal's paths.
 * @param root - project root.
 * @param from - revision the tree was overlaid onto.
 * @param to - written tree.
 * @param wanted - the seal's changed paths.
 * @returns true when no difference falls outside the set.
 */
function differencesStayWithin(root, from, to, wanted) {
  const result = spawnSync('git', ['-C', root, 'diff', '--name-only', '-z', from, to], { encoding: 'utf8' })
  if (result.status !== 0) return false
  return result.stdout.split('\0').every((path) => path === '' || wanted.has(path))
}

/**
 * Overlay the paths a seal commit changed onto another revision's tree.
 *
 * A draft-baseline review starts its diff at "the branch point plus the sealed
 * plan". After the branch takes in newer main, that origin is rebuilt here
 * instead of replaying the seal commit, which a rebase may have rewritten or
 * dropped. The written tree is checked against the seal and the fork before it
 * is returned, so a path-prefix mistake fails closed instead of producing a
 * fork-only tree.
 *
 * @param options - root, sealCommit and the revision to overlay onto.
 * @returns the tree SHA, or undefined when the tree cannot be built or checked.
 */
export function overlaySealTree(options) {
  const { root, sealCommit, onto } = options
  const paths = sealChangedPaths(root, sealCommit)
  if (paths === undefined || paths.length === 0) return undefined
  const sealEntries = treeEntries(root, sealCommit, paths)
  if (sealEntries === undefined) return undefined
  const wanted = new Set(paths)
  const directory = mkdtempSync(join(tmpdir(), 'openspec-flow-overlay-'))
  const env = { ...process.env, GIT_INDEX_FILE: join(directory, 'index') }
  try {
    git(root, ['read-tree', onto], { env })
    const input = paths.map((path) => {
      const entry = sealEntries.get(path)
      return entry === undefined
        ? `0 ${ZERO_SHA}\t${path}\0`
        : `${entry.mode} ${entry.sha}\t${path}\0`
    }).join('')
    git(root, ['update-index', '-z', '--index-info'], { env, input })
    const tree = git(root, ['write-tree'], { env }).trim()
    if (tree === '') return undefined
    if (!sealEntriesMatch(root, tree, paths, sealEntries)) return undefined
    if (!differencesStayWithin(root, onto, tree, wanted)) return undefined
    return tree
  } catch {
    return undefined
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

/**
 * Hash the draft artifacts as they appear in the seal commit's tree.
 * @param root - project root.
 * @param commit - seal commit.
 * @param changePath - worktree-relative change directory.
 * @param files - `{ path }` entries relative to the change directory.
 * @returns the artifact hash.
 */
export function sealArtifactHash(root, commit, changePath, files) {
  const prefix = changePath === '' ? '' : `${changePath.replace(/\/+$/u, '')}/`
  const entries = files.map((file) => {
    const text = git(root, ['show', `${commit}:${prefix}${file.path}`])
    return { path: file.path, sha256: artifactFileHash(file.path, text) }
  })
  return hashFiles(entries)
}

/**
 * Attach the seal commit to the apply branch and the seal ref.
 *
 * An existing branch is reset to the new seal commit when no worktree checks
 * it out, which covers a fresh draft after a removed abandoned checkout. A
 * branch checked out by a worktree refuses.
 * @param options - root, store, change, commit.
 * @returns nothing.
 */
export function pinSeal(options) {
  const { root, store, change, commit } = options
  const branch = sealBranchName(store, change)
  const used = git(root, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .some((line) => line.trim() === `branch refs/heads/${branch}`)
  if (used) {
    throw new Error(
      `the apply branch '${branch}' is checked out by a worktree; remove that worktree or wait for its land before sealing '${change}'`,
    )
  }
  git(root, ['update-ref', `refs/heads/${branch}`, commit])
  git(root, ['update-ref', sealRefName(store, change), commit])
}

/**
 * Delete the seal ref when it exists.
 * @param root - project root.
 * @param store - optional store id.
 * @param change - change name.
 * @returns nothing.
 */
export function removeSealRef(root, store, change) {
  const ref = sealRefName(store, change)
  if (!gitOk(root, ['rev-parse', '--verify', '--quiet', ref])) return
  spawnSync('git', ['-C', root, 'update-ref', '-d', ref], { encoding: 'utf8' })
}

