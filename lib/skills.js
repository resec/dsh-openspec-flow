/**
 * Skill document handling for the plugin-generated workflow skills.
 *
 * Skills are read from the packaged `skills/` directory, written into a
 * project's `.dsh/skills/`, and migrated from the official copies after a
 * backup. Classification uses the frontmatter `metadata.generatedBy` value:
 * an OpenSpec version marks an official copy, a plugin version marks one of
 * ours, and anything else is a user-authored file that must not be replaced
 * without an explicit force.
 *
 * @module dsh-openspec-flow/skills
 */

import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Plugin manifest, read for the version stamped into generated skills. */
const MANIFEST_PATH = fileURLToPath(new URL('../package.json', import.meta.url))

/** The plugin version. */
export const PLUGIN_VERSION = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')).version

/** Value written to `metadata.generatedBy`. */
export const GENERATED_BY = `dsh-openspec-flow@${PLUGIN_VERSION}`

/** OpenSpec version the skill text is written against. */
export const UPSTREAM_VERSION = '1.16.0'

/** Skills the plugin installs, in catalog order. */
export const SKILL_NAMES = [
  'openspec-explore',
  'openspec-propose',
  'openspec-apply-change',
  'openspec-archive-change',
  'openspec-sync-specs',
  'openspec-update-change',
]

/** Packaged skill root. */
const PACKAGED_ROOT = fileURLToPath(new URL('../skills/', import.meta.url))

/** Backup root under the project, outside `.dsh/skills` so DSH never loads it. */
const BACKUP_ROOT = '.dsh/openspec-flow-backup'

/**
 * Absolute path of one packaged skill.
 * @param name - skill name.
 * @returns the path.
 */
export function packagedSkillPath(name) {
  return join(PACKAGED_ROOT, name, 'SKILL.md')
}

/**
 * Read the packaged skills that are present in this install.
 * @returns `[{ name, content }]` in catalog order.
 */
export function readPackagedSkills() {
  const skills = []
  for (const name of SKILL_NAMES) {
    const path = packagedSkillPath(name)
    if (!existsSync(path)) continue
    skills.push({ name, content: readFileSync(path, 'utf8') })
  }
  return skills
}

/**
 * Parse the frontmatter subset the skills use.
 *
 * Supports top-level `key: value` lines and one `metadata:` block of indented
 * `key: value` lines. It is deliberately not a general YAML parser.
 *
 * @param raw - skill document.
 * @returns the parsed frontmatter with a `metadata` object.
 * @throws Error when the document has no frontmatter.
 */
export function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (match === null) {
    throw new Error('skill document must start with a --- frontmatter block')
  }
  const top = {}
  const metadata = {}
  let section = top
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const parsed = /^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line)
    if (parsed === null) continue
    const [, indent, key, rawValue] = parsed
    const value = stripQuotes(rawValue.trim())
    if (indent.length === 0) {
      if (key === 'metadata') {
        section = metadata
        continue
      }
      section = top
      top[key] = value
    } else {
      section[key] = value
    }
  }
  return { ...top, metadata }
}

/**
 * Strip matching surrounding quotes.
 * @param value - raw scalar.
 * @returns the unquoted scalar.
 */
function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

/**
 * Classify a `generatedBy` value.
 * @param generatedBy - frontmatter value.
 * @returns `official`, `current`, `plugin-other` or `unknown`.
 */
export function classifyGeneratedBy(generatedBy) {
  if (typeof generatedBy !== 'string' || generatedBy.trim() === '') return 'unknown'
  const value = generatedBy.trim()
  if (value.startsWith('dsh-openspec-flow@')) {
    return value === GENERATED_BY ? 'current' : 'plugin-other'
  }
  if (value === 'openspec' || /^\d+\.\d+\.\d+(?:[-+].*)?$/u.test(value)) return 'official'
  return 'unknown'
}

/**
 * Inspect one installed skill.
 * @param projectPath - project root.
 * @param name - skill name.
 * @returns the inspection result.
 */
export function inspectSkill(projectPath, name) {
  const path = join(projectPath, '.dsh', 'skills', name, 'SKILL.md')
  if (!existsSync(path)) return { name, path, exists: false }
  const content = readFileSync(path, 'utf8')
  let generatedBy
  try {
    generatedBy = parseFrontmatter(content).metadata.generatedBy
  } catch {
    generatedBy = undefined
  }
  return {
    name,
    path,
    exists: true,
    content,
    generatedBy,
    classification: classifyGeneratedBy(generatedBy),
    hash: hashContent(content),
  }
}

/**
 * SHA-1 of a skill document, used for idempotent writes.
 * @param content - document text.
 * @returns the hex digest.
 */
export function hashContent(content) {
  return createHash('sha1').update(content, 'utf8').digest('hex')
}

/**
 * Build the backup directory for one run.
 * @param projectPath - project root.
 * @param now - clock.
 * @returns the absolute backup directory.
 */
export function backupDirectory(projectPath, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/gu, '-')
  return join(projectPath, BACKUP_ROOT, stamp)
}

/**
 * Copy one installed skill directory into a backup.
 * @param projectPath - project root.
 * @param name - skill name.
 * @param backupDir - backup root for this run.
 * @returns the backup path.
 */
export function backupSkill(projectPath, name, backupDir) {
  const source = join(projectPath, '.dsh', 'skills', name)
  const target = join(backupDir, name)
  if (!existsSync(source)) return target
  mkdirSync(backupDir, { recursive: true })
  cpSync(source, target, { recursive: true })
  return target
}

/**
 * Write one skill document into a project.
 * @param projectPath - project root.
 * @param name - skill name.
 * @param content - document text.
 * @returns the written path.
 */
export function writeSkill(projectPath, name, content) {
  const dir = join(projectPath, '.dsh', 'skills', name)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'SKILL.md')
  writeFileSync(path, content)
  return path
}

/**
 * Install the packaged skills and migrate same-named installed copies.
 *
 * Classifications:
 * - missing: write.
 * - current with identical bytes: skip.
 * - current with different bytes, official, or plugin-other: back up and write.
 * - unknown: conflict; back up and write only when `force` is true.
 *
 * @param projectPath - project root.
 * @param options - `force` and clock.
 * @returns `{ written, migrated, skipped, conflicts, backupDir, skills }`.
 */
export function installSkills(projectPath, options = {}) {
  const force = options.force === true
  const now = options.now instanceof Date ? options.now : new Date()
  const packaged = readPackagedSkills()
  const written = []
  const migrated = []
  const skipped = []
  const conflicts = []
  let backupDir

  for (const skill of packaged) {
    const installed = inspectSkill(projectPath, skill.name)
    const nextHash = hashContent(skill.content)

    if (!installed.exists) {
      writeSkill(projectPath, skill.name, skill.content)
      written.push(skill.name)
      continue
    }
    if (installed.hash === nextHash) {
      skipped.push(skill.name)
      continue
    }
    if (installed.classification === 'unknown' && !force) {
      conflicts.push({ name: skill.name, path: installed.path, generatedBy: installed.generatedBy ?? null })
      continue
    }

    backupDir ??= backupDirectory(projectPath, now)
    backupSkill(projectPath, skill.name, backupDir)
    writeSkill(projectPath, skill.name, skill.content)
    if (installed.classification === 'official' || installed.classification === 'plugin-other') {
      migrated.push(skill.name)
    } else {
      written.push(skill.name)
    }
  }

  return {
    written,
    migrated,
    skipped,
    conflicts,
    ...(backupDir !== undefined ? { backupDir } : {}),
    skills: packaged.map((skill) => skill.name),
  }
}

/**
 * Whether a path is a directory.
 * @param path - candidate path.
 * @returns true for a directory.
 */
export function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
