#!/usr/bin/env node
/**
 * Push a landed apply-worktree change to `origin/main` after verifying its manifest.
 *
 * The plugin's land step writes `<git common dir>/openspec-flow/landed/<merge>.json` and never
 * pushes. This repository-side command re-derives the land facts from that manifest, defaults to a
 * dry run, and performs the push only when `--push` is passed.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { filterUnrelatedChangeStatus } from '../lib/review/store.js'

/** Manifest directory under the git common directory. */
export const MANIFEST_DIRECTORY = 'openspec-flow/landed'

/** SHA-1 object id. */
const OBJECT_ID = /^[0-9a-f]{40}$/iu

/** Usage error, mapped to exit code 2. */
export class UsageError extends Error {
  /** @param message - usage diagnostic. */
  constructor(message) {
    super(message)
    this.name = 'UsageError'
  }
}

/**
 * Run git in one checkout.
 * @param cwd - repository directory.
 * @param args - git arguments.
 * @param options - `allowFailure` returns the result instead of throwing.
 * @returns the spawn result.
 */
function runGit(cwd, args, options = {}) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0 && options.allowFailure !== true) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`)
  }
  return result
}

/**
 * Run git and return trimmed stdout, throwing on failure.
 * @param cwd - repository directory.
 * @param args - git arguments.
 * @returns trimmed stdout.
 */
function gitText(cwd, args) {
  return runGit(cwd, args).stdout.trim()
}

/**
 * Whether git exits successfully for a command.
 * @param cwd - repository directory.
 * @param args - git arguments.
 * @returns true on exit 0.
 */
function gitSucceeds(cwd, args) {
  return runGit(cwd, args, { allowFailure: true }).status === 0
}

/**
 * Whether one commit is an ancestor of another, including equality.
 * @param cwd - repository directory.
 * @param ancestor - candidate ancestor.
 * @param descendant - candidate descendant.
 * @returns true when git reports containment.
 */
function isAncestor(cwd, ancestor, descendant) {
  return gitSucceeds(cwd, ['merge-base', '--is-ancestor', ancestor, descendant])
}

/**
 * Parse the supported flags.
 * @param argv - command-line arguments.
 * @returns parsed options.
 * @throws {UsageError} on an unknown, duplicate or incomplete flag.
 */
export function parseArgs(argv) {
  const options = { push: false, change: undefined, merge: undefined, manifest: undefined, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--push') {
      if (options.push) throw new UsageError('--push was passed more than once')
      options.push = true
      continue
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }
    const match = /^(--change|--merge|--manifest)(?:=(.*))?$/u.exec(argument)
    if (match === null) throw new UsageError(`unknown argument '${argument}'`)
    const name = match[1].slice(2)
    const value = match[2] !== undefined ? match[2] : argv[index + 1]
    if (value === undefined || value === '' || (match[2] === undefined && value.startsWith('--'))) {
      throw new UsageError(`${match[1]} needs a value`)
    }
    if (options[name] !== undefined) throw new UsageError(`${match[1]} was passed more than once`)
    options[name] = value
    if (match[2] === undefined) index += 1
  }
  return options
}

/**
 * Render the command usage.
 * @returns usage text.
 */
export function usage() {
  return [
    'usage: node scripts/push-landed.mjs [--push] [--change <name>|--merge <sha>|--manifest <path>]',
    '',
    'Verifies a landed manifest and pushes main only with --push. The default is a dry run.',
  ].join('\n')
}

/**
 * Read and validate one manifest file.
 * @param file - absolute manifest path.
 * @returns parsed manifest.
 * @throws when the file is unreadable or not a manifest object.
 */
export function readManifest(file) {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`cannot read landed manifest ${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`landed manifest ${file} is not a JSON object`)
  }
  return manifest
}

/**
 * Validate the fields the push decision depends on.
 * @param manifest - parsed manifest.
 * @param file - manifest path for diagnostics.
 * @returns a normalized manifest.
 * @throws when a required field is missing or malformed.
 */
export function validateManifest(manifest, file) {
  for (const field of ['change', 'featureTree', 'mergeCommit', 'archiveCommit', 'approvedBy']) {
    if (typeof manifest[field] !== 'string' || manifest[field].trim() === '') {
      throw new Error(`landed manifest ${file} has no ${field}`)
    }
  }
  for (const field of ['featureTree', 'mergeCommit', 'archiveCommit']) {
    if (OBJECT_ID.test(manifest[field]) === false) {
      throw new Error(`landed manifest ${file} has an invalid ${field} '${manifest[field]}'`)
    }
  }
  if (manifest.store !== undefined && manifest.store !== null && typeof manifest.store !== 'string') {
    throw new Error(`landed manifest ${file} has an invalid store`)
  }
  if (manifest.landedAt !== undefined && (typeof manifest.landedAt !== 'string' || Number.isNaN(Date.parse(manifest.landedAt)))) {
    throw new Error(`landed manifest ${file} has an invalid landedAt`)
  }
  return {
    ...manifest,
    featureTree: manifest.featureTree.toLowerCase(),
    mergeCommit: manifest.mergeCommit.toLowerCase(),
    archiveCommit: manifest.archiveCommit.toLowerCase(),
  }
}

/**
 * Read every manifest in the landed directory.
 * @param directory - landed directory.
 * @returns `{ file, manifest }` entries.
 * @throws when the directory is absent, empty or holds an unreadable manifest.
 */
export function listManifests(directory, options = {}) {
  if (!existsSync(directory)) throw new Error(`landed manifest directory ${directory} does not exist`)
  const names = readdirSync(directory).filter((name) => name.endsWith('.json')).sort()
  if (names.length === 0) throw new Error(`landed manifest directory ${directory} has no manifest`)
  const entries = []
  for (const name of names) {
    const file = join(directory, name)
    try {
      entries.push({ file, manifest: readManifest(file) })
    } catch (error) {
      if (options.skipUnreadable !== true) throw error
      process.stderr.write(`push-landed: skipping unreadable manifest ${file}: ${error instanceof Error ? error.message : String(error)}\n`)
    }
  }
  if (entries.length === 0) throw new Error(`landed manifest directory ${directory} has no readable manifest`)
  return entries
}

/**
 * Select one manifest by explicit path, merge commit, change or latest landedAt.
 * @param entries - manifest entries.
 * @param options - parsed options.
 * @param cwd - directory used to resolve a relative manifest path.
 * @returns the selected entry.
 * @throws when the selection is missing or ambiguous.
 */
export function selectManifest(entries, options, cwd = process.cwd()) {
  if (options.manifest !== undefined) {
    const file = isAbsolute(options.manifest) ? options.manifest : resolve(cwd, options.manifest)
    return { file, manifest: validateManifest(readManifest(file), file) }
  }
  if (options.merge !== undefined) {
    const matches = entries.filter((entry) => String(entry.manifest.mergeCommit).toLowerCase().startsWith(options.merge.toLowerCase()))
    if (matches.length === 0) throw new Error(`no landed manifest has merge commit ${options.merge}`)
    if (matches.length > 1) throw new Error(`merge prefix ${options.merge} is ambiguous in the landed directory`)
    return { ...matches[0], manifest: validateManifest(matches[0].manifest, matches[0].file) }
  }
  if (options.change !== undefined) {
    const matches = entries.filter((entry) => entry.manifest.change === options.change)
    if (matches.length === 0) throw new Error(`no landed manifest has change ${options.change}`)
    if (matches.length > 1) throw new Error(`change ${options.change} has more than one landed manifest; pass --merge`)
    return { ...matches[0], manifest: validateManifest(matches[0].manifest, matches[0].file) }
  }
  const sorted = [...entries].sort((left, right) => {
    const leftAt = Date.parse(left.manifest.landedAt ?? '') || 0
    const rightAt = Date.parse(right.manifest.landedAt ?? '') || 0
    return rightAt - leftAt || right.file.localeCompare(left.file)
  })
  const latest = sorted[0]
  return { ...latest, manifest: validateManifest(latest.manifest, latest.file) }
}

/**
 * Resolve the main worktree and its common directory.
 * @param cwd - current directory.
 * @returns `{ root, commonDir }`.
 * @throws when the caller is not in the main worktree.
 */
export function resolveRepository(cwd = process.cwd()) {
  const root = gitText(cwd, ['rev-parse', '--show-toplevel'])
  const gitDirectory = resolve(cwd, gitText(cwd, ['rev-parse', '--git-dir']))
  const commonDirectory = resolve(cwd, gitText(cwd, ['rev-parse', '--git-common-dir']))
  if (gitDirectory !== commonDirectory) {
    throw new Error(`${root} is a linked worktree; run push-landed from the main worktree`)
  }
  return { root, commonDir: commonDirectory }
}

/**
 * Check branch, cleanliness and commit facts before the remote is contacted.
 * @param root - main worktree.
 * @param manifest - validated manifest.
 * @returns the current HEAD.
 * @throws when a fact is wrong.
 */
export function validateLocalState(root, manifest) {
  const branch = runGit(root, ['symbolic-ref', '--short', 'HEAD'], { allowFailure: true })
  if (branch.status !== 0) throw new Error('main worktree HEAD is detached; switch to main')
  if (branch.stdout.trim() !== 'main') throw new Error(`main worktree is on ${branch.stdout.trim()}, not main`)

  const status = runGit(root, ['status', '--porcelain'], { allowFailure: true })
  if (status.status !== 0) throw new Error('cannot read the main worktree status')
  const remaining = filterUnrelatedChangeStatus(status.stdout, `openspec/changes/${manifest.change}`)
  if (remaining.length > 0) {
    throw new Error(`main worktree is not clean:\n${remaining.join('\n')}`)
  }

  if (manifest.approvedBy !== 'user') {
    throw new Error(`landed manifest ${manifest.change} was not approved by the user (approvedBy: ${manifest.approvedBy})`)
  }

  for (const field of ['mergeCommit', 'archiveCommit']) {
    if (!gitSucceeds(root, ['cat-file', '-e', `${manifest[field]}^{commit}`])) {
      throw new Error(`landed manifest ${manifest.change} names ${field} ${manifest[field]}, which is not a commit`)
    }
  }

  const head = gitText(root, ['rev-parse', 'HEAD']).toLowerCase()
  if (head !== manifest.archiveCommit) {
    throw new Error(`HEAD ${head} is not the selected landed archiveCommit ${manifest.archiveCommit}; run the latest landed manifest`)
  }
  if (!isAncestor(root, manifest.mergeCommit, manifest.archiveCommit)) {
    throw new Error(`merge commit ${manifest.mergeCommit} is not an ancestor of archive commit ${manifest.archiveCommit}`)
  }
  const tree = gitText(root, ['rev-parse', `${manifest.mergeCommit}^{tree}`]).toLowerCase()
  if (tree !== manifest.featureTree) {
    throw new Error(`merge tree ${tree} does not match the reviewed featureTree ${manifest.featureTree}`)
  }

  const diff = gitText(root, ['diff', '--name-status', '--no-renames', manifest.mergeCommit, manifest.archiveCommit])
  const own = `openspec/changes/${manifest.change}/`
  const unexpected = []
  for (const line of diff.split('\n').filter((entry) => entry.trim() !== '')) {
    const separator = line.indexOf('\t')
    if (separator === -1) {
      unexpected.push(line)
      continue
    }
    const statusCode = line.slice(0, separator)
    const path = line.slice(separator + 1)
    if (path.startsWith('openspec/changes/archive/') || path.startsWith('openspec/specs/')) continue
    if (path.startsWith(own) && statusCode === 'D') continue
    unexpected.push(`${statusCode} ${path}`)
  }
  if (unexpected.length > 0) {
    throw new Error(`archive commit ${manifest.archiveCommit} touches paths outside the archived change and specs:\n${unexpected.join('\n')}`)
  }
  return head
}

/**
 * Fetch origin main and return its commit.
 * @param root - main worktree.
 * @returns remote main commit.
 * @throws when the fetch or the remote ref fails.
 */
export function fetchRemoteMain(root) {
  const fetched = runGit(root, ['fetch', 'origin', 'main'], { allowFailure: true })
  if (fetched.status !== 0) {
    throw new Error(`cannot fetch origin main: ${(fetched.stderr || '').trim()}`)
  }
  const remote = runGit(root, ['rev-parse', '--verify', 'origin/main^{commit}'], { allowFailure: true })
  if (remote.status !== 0 || remote.stdout.trim() === '') {
    throw new Error('origin/main does not resolve after fetching')
  }
  return remote.stdout.trim().toLowerCase()
}

/**
 * Push HEAD to origin main without bypassing hooks.
 * @param root - main worktree.
 * @returns remote commit reported by ls-remote.
 */
export function pushMain(root) {
  const pushed = runGit(root, ['push', 'origin', 'HEAD:refs/heads/main'], { allowFailure: true })
  if (pushed.stdout.trim() !== '') process.stdout.write(pushed.stdout)
  if (pushed.stderr.trim() !== '') process.stderr.write(pushed.stderr)
  if (pushed.status !== 0) {
    throw new Error(`git push origin HEAD:refs/heads/main failed${pushed.stderr.trim() === '' ? '' : `: ${pushed.stderr.trim()}`}`)
  }
  const remote = runGit(root, ['ls-remote', '--heads', 'origin', 'main'], { allowFailure: true })
  if (remote.status !== 0) throw new Error('cannot confirm origin/main after the push')
  const line = remote.stdout.split('\n').find((entry) => entry.endsWith('\trefs/heads/main'))
  if (line === undefined) throw new Error('origin has no main branch after the push')
  return line.split(/\s+/u)[0].toLowerCase()
}

/**
 * Print the selected manifest and the outcome.
 * @param entry - selected manifest.
 * @param details - outcome details.
 */
function report(entry, details) {
  process.stdout.write([
    `push-landed: manifest ${entry.file}`,
    `change: ${entry.manifest.change}`,
    `merge: ${entry.manifest.mergeCommit}`,
    `archive: ${entry.manifest.archiveCommit}`,
    `tree: ${entry.manifest.featureTree}`,
    `remote: origin/main ${details.remote}`,
    `action: ${details.action}`,
  ].join('\n') + '\n')
}

/**
 * Run the command.
 * @param argv - command-line arguments.
 * @returns process exit code.
 */
export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    process.stdout.write(`${usage()}\n`)
    return 0
  }
  const { root, commonDir } = resolveRepository(process.cwd())
  const directory = join(commonDir, MANIFEST_DIRECTORY)
  let entry
  if (options.manifest !== undefined) {
    const file = isAbsolute(options.manifest) ? options.manifest : resolve(process.cwd(), options.manifest)
    entry = { file, manifest: validateManifest(readManifest(file), file) }
  } else {
    const entries = listManifests(directory, {
      skipUnreadable: options.change !== undefined || options.merge !== undefined,
    })
    entry = selectManifest(entries, options, process.cwd())
  }
  const head = validateLocalState(root, entry.manifest)
  const remote = fetchRemoteMain(root)

  if (remote === head) {
    report(entry, { remote, action: 'already pushed; nothing to do' })
    return 0
  }
  if (!isAncestor(root, remote, head)) {
    if (isAncestor(root, head, remote)) {
      throw new Error('origin/main is ahead of HEAD; fetch and reconcile main before pushing')
    }
    throw new Error('local main and origin/main have diverged; reconcile them before pushing')
  }

  const range = gitText(root, ['log', '--oneline', `${remote}..${head}`])
  const count = range === '' ? 0 : range.split('\n').length
  if (!options.push) {
    report(entry, { remote, action: `dry-run; ${count} commit(s) would be pushed; pass --push to push` })
    if (range !== '') process.stdout.write(`${range}\n`)
    return 0
  }

  const pushed = pushMain(root)
  if (pushed !== head) {
    throw new Error(`origin/main is ${pushed} after the push, expected ${head}`)
  }
  report(entry, { remote: pushed, action: `pushed ${count} commit(s)` })
  return 0
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    process.exitCode = main()
  } catch (error) {
    console.error(`push-landed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = error instanceof UsageError ? 2 : 1
  }
}
