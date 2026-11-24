#!/usr/bin/env node
/**
 * Pull-request gate for the external contribution contract.
 *
 * It requires one active change, no unchecked task in that change, and no
 * restricted path. Package.json is allowed to change scripts, but not a
 * dependency, engine or package-manager field. A maintainer-authored
 * same-repository pull request may pass `--maintainer` to skip only the
 * restricted-path refusal; every other validation still runs.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ACTIVE_CHANGE = /^openspec\/changes\/([^/]+)\/(.+)$/
const TASK = /^\s*[-*]\s+\[([^\]]*)\]\s*(.*)$/
const RESTRICTED_PREFIXES = ['.githooks/', '.github/workflows/', 'dist/', 'openspec/changes/archive/']
const RESTRICTED_FILES = new Set(['coverage.baseline.json', 'package-lock.json'])
const DEPENDENCY_KEYS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'engines',
  'packageManager',
]

/**
 * Whether a path belongs to an active change.
 * @param path - repository-relative path.
 * @returns whether the path is inside a non-archive change.
 */
export function isActiveChangePath(path) {
  const match = ACTIVE_CHANGE.exec(String(path))
  return match !== null && match[1] !== 'archive'
}

/**
 * Collect the active change names touched by a path list.
 * @param paths - repository-relative paths.
 * @returns ordered change names.
 */
export function activeChangeNames(paths) {
  const names = []
  const seen = new Set()
  for (const path of paths) {
    const match = ACTIVE_CHANGE.exec(String(path))
    if (match === null || match[1] === 'archive' || seen.has(match[1])) continue
    seen.add(match[1])
    names.push(match[1])
  }
  return names
}

/**
 * Find unchecked task lines in a tasks.md body.
 * @param markdown - tasks.md contents.
 * @returns `{ id, text }` entries.
 */
export function uncheckedTasks(markdown) {
  const tasks = []
  const lines = String(markdown).split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const match = TASK.exec(lines[index])
    if (match === null) continue
    if (match[1].trim().toLowerCase() === 'x') continue
    const text = match[2].trim()
    const id = /^(\S+)/.exec(text)?.[1] ?? `line-${index + 1}`
    tasks.push({ id, text })
  }
  return tasks
}

/**
 * Whether a path is restricted for an external pull request.
 * @param path - repository-relative path.
 * @returns whether the path is restricted.
 */
export function isRestrictedPath(path) {
  const value = String(path).replace(/\\/g, '/')
  if (RESTRICTED_FILES.has(value)) return true
  return RESTRICTED_PREFIXES.some((prefix) => value.startsWith(prefix))
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    )
  }
  return value
}

/**
 * Whether a package.json edit changes dependency, engine or package-manager fields.
 * @param base - package.json object before the pull request.
 * @param head - package.json object after the pull request.
 * @returns whether a restricted field changed.
 */
export function hasDependencyChange(base, head) {
  for (const key of DEPENDENCY_KEYS) {
    if (JSON.stringify(canonical(base?.[key])) !== JSON.stringify(canonical(head?.[key]))) {
      return true
    }
  }
  return false
}

/**
 * Evaluate the pull request facts collected by the CLI.
 * @param input - paths, tasks by change, package.json snapshots and the maintainer flag.
 * @returns error messages.
 */
export function evaluateChange({ paths, tasksByChange = {}, basePackageJson, headPackageJson, maintainer = false }) {
  const errors = []
  const names = activeChangeNames(paths)
  if (names.length === 0) {
    errors.push('the pull request must add or update an active change under openspec/changes/<name>/')
  } else if (names.length > 1) {
    errors.push(`the pull request must touch exactly one active change; found: ${names.join(', ')}`)
  } else {
    for (const name of names) {
      const tasks = tasksByChange[name]
      if (tasks === undefined) {
        errors.push(`the change ${name} has no tasks.md`)
        continue
      }
      const unchecked = uncheckedTasks(tasks)
      if (unchecked.length > 0) {
        errors.push(`the change ${name} has unchecked tasks: ${unchecked.map((task) => task.id).join(', ')}`)
      }
    }
  }
  for (const path of paths) {
    if (!maintainer && isRestrictedPath(path)) {
      errors.push(`restricted path changed: ${path}`)
    }
  }
  if (basePackageJson !== undefined && headPackageJson !== undefined && hasDependencyChange(basePackageJson, headPackageJson)) {
    errors.push('package.json dependency, engine or package-manager fields changed')
  }
  return errors
}

/**
 * Run git in a repository root.
 * @param args - git arguments.
 * @param root - repository root.
 * @returns stdout.
 */
function git(args, root = ROOT) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`)
  return result.stdout
}

/**
 * The files a pull request changes, comparing the head with the recorded base.
 * @param base - recorded pull-request base commit.
 * @param head - pull-request head commit, or `HEAD` for a local run.
 * @param root - repository root.
 * @returns repository-relative paths.
 */
export function changedPaths(base, head = 'HEAD', root = ROOT) {
  const output = git(['diff', '--name-only', `${base}...${head}`], root)
  return output.split('\n').map((line) => line.trim()).filter(Boolean)
}

/**
 * Read one revision's package.json, tolerating a missing file.
 * @param revision - commit.
 * @returns parsed object, or undefined.
 */
export function packageJsonAt(revision) {
  try {
    return JSON.parse(git(['show', `${revision}:package.json`]))
  } catch {
    return undefined
  }
}

/**
 * Read the pull-request head's package.json, failing when it cannot be read.
 * @param revision - commit.
 * @returns parsed object.
 */
export function headPackageJsonAt(revision) {
  return JSON.parse(git(['show', `${revision}:package.json`]))
}

/**
 * Parse `--head`, defaulting to `HEAD`.
 * @param argv - arguments after the script.
 * @returns the revision, or null when the flag has no value.
 */
export function parseHead(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--head') {
      const next = argv[index + 1]
      return next === undefined || next === '' || next.startsWith('--') ? null : next
    }
    if (arg.startsWith('--head=')) {
      const value = arg.slice('--head='.length)
      return value === '' ? null : value
    }
  }
  return 'HEAD'
}

/**
 * Whether the maintainer same-repository exemption was requested.
 * @param argv - arguments after the script.
 * @returns whether `--maintainer` is present.
 */
export function parseMaintainer(argv) {
  return argv.includes('--maintainer')
}

function parseBase(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help') return undefined
    if (arg === '--base') return argv[index + 1]
    if (arg.startsWith('--base=')) return arg.slice('--base='.length)
  }
  return undefined
}

function main() {
  const argv = process.argv.slice(2)
  const base = parseBase(argv)
  if (base === undefined) {
    console.error('usage: node scripts/check-pr-change.mjs --base <commit> [--head <commit>] [--maintainer]')
    process.exitCode = 2
    return
  }
  const head = parseHead(argv)
  if (head === null) {
    console.error('usage: node scripts/check-pr-change.mjs --base <commit> [--head <commit>] [--maintainer]')
    process.exitCode = 2
    return
  }
  const paths = changedPaths(base, head)
  const tasksByChange = {}
  for (const name of activeChangeNames(paths)) {
    try {
      tasksByChange[name] = readFileSync(join(ROOT, 'openspec', 'changes', name, 'tasks.md'), 'utf8')
    } catch {
      tasksByChange[name] = undefined
    }
  }
  const errors = evaluateChange({
    paths,
    tasksByChange,
    basePackageJson: packageJsonAt(base),
    headPackageJson: headPackageJsonAt(head),
    maintainer: parseMaintainer(argv),
  })
  if (errors.length > 0) {
    for (const error of errors) console.error(`change check: ${error}`)
    process.exitCode = 1
    return
  }
  console.log('change check: ok')
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main()
  } catch (error) {
    console.error(`change check: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
