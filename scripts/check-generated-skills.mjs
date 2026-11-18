#!/usr/bin/env node
/**
 * Reject OpenSpec-generated skill copies in a pull request diff or the
 * workspace. The repository's own root skills are allowed.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ROOT_SKILL = /^skills\/openspec-[^/]+\//
const GENERATED_SKILL = /^(?:[^/]+\/)*skills\/openspec-[^/]+\//
const GENERATED_COMMAND = /^(?:[^/]+\/)*commands\/(?:opsx|openspec)\//
const SKIPPED_DIRS = new Set([
  '.git',
  'node_modules',
  '.cache',
  'dist',
  'coverage',
  '.coverage',
  '.npmcache',
  '.pnpm-store',
])

/**
 * Whether a path is one of the repository's own root skills.
 * @param path - repository-relative path.
 * @returns whether the path is a root skill.
 */
export function isRootSkillPath(path) {
  return ROOT_SKILL.test(String(path).replace(/\\/g, '/'))
}

/**
 * Whether a path looks like a generated skill or command path.
 * @param path - repository-relative path.
 * @returns whether the path is generated.
 */
export function isGeneratedSkillPath(path) {
  const value = String(path).replace(/\\/g, '/')
  if (isRootSkillPath(value)) return false
  if (value.split('/').at(-1) === '.openspec-target') return true
  return GENERATED_SKILL.test(value) || GENERATED_COMMAND.test(value)
}

/**
 * Whether a text carries the generated skill frontmatter markers.
 * @param text - file contents.
 * @returns whether the frontmatter matches a generated skill.
 */
export function hasGeneratedFrontmatter(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split('\n').slice(0, 40)
  let inMetadata = false
  let author = false
  let compatibility = false
  for (const line of lines) {
    if (/^name:\s*openspec-/.test(line)) continue
    if (/^metadata:\s*$/.test(line)) {
      inMetadata = true
      continue
    }
    if (/^compatibility:\s*Requires openspec CLI\.\s*$/.test(line)) compatibility = true
    if (inMetadata && /^\s+author:\s*openspec\s*$/.test(line)) author = true
  }
  const named = lines.some((line) => /^name:\s*openspec-/.test(line))
  const allowed = lines.some((line) => /^allowed-tools:/.test(line))
  return named && allowed && (author || compatibility)
}

/**
 * Classify one file as a generated skill copy.
 * @param input - path and contents.
 * @returns `{ generated, reason }`.
 */
export function classifyGeneratedSkill({ path, content }) {
  if (isGeneratedSkillPath(path)) return { generated: true, reason: 'generated path' }
  if (typeof content === 'string' && hasGeneratedFrontmatter(content)) {
    return { generated: true, reason: 'generated frontmatter' }
  }
  return { generated: false, reason: undefined }
}

function walk(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue
      walk(join(directory, entry.name), files)
      continue
    }
    files.push(relative(ROOT, join(directory, entry.name)))
  }
}

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`)
  return result.stdout
}

function parseArguments(argv) {
  const options = { base: undefined, workspace: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--workspace') options.workspace = true
    else if (arg === '--base') options.base = argv[index + 1]
    else if (arg.startsWith('--base=')) options.base = arg.slice('--base='.length)
    else if (arg === '--help') options.help = true
    else throw new Error(`unknown option: ${arg}`)
  }
  return options
}

function checkFiles(paths) {
  const errors = []
  for (const path of paths) {
    const absolute = join(ROOT, path)
    let content
    try {
      if (existsSync(absolute) && statSync(absolute).isFile()) content = readFileSync(absolute, 'utf8')
    } catch {
      content = undefined
    }
    const result = classifyGeneratedSkill({ path, content })
    if (result.generated) errors.push(`${path} (${result.reason})`)
  }
  return errors
}

function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    console.log('usage: node scripts/check-generated-skills.mjs --base <commit> | --workspace')
    return
  }
  let paths
  if (options.workspace) {
    paths = []
    walk(ROOT, paths)
  } else if (options.base !== undefined) {
    paths = git(['diff', '--name-only', '--diff-filter=AM', `${options.base}...HEAD`])
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } else {
    console.error('usage: node scripts/check-generated-skills.mjs --base <commit> | --workspace')
    process.exitCode = 2
    return
  }
  const errors = checkFiles(paths)
  if (errors.length > 0) {
    for (const error of errors) console.error(`generated skill check: ${error}`)
    console.error('Remove the generated skill copies; the plugin serves its own skills. Local installation is fine when it is not committed.')
    process.exitCode = 1
    return
  }
  console.log('generated skill check: ok')
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main()
  } catch (error) {
    console.error(`generated skill check: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
