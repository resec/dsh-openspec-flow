/**
 * Packaged skill discovery for the plugin's skill provider.
 *
 * The workflow skills ship under `skills/<name>/SKILL.md`. This module owns
 * their names, paths and frontmatter parsing; `lib/skill.js` turns them into
 * provider candidates. The plugin never writes a project's `.dsh/skills/` and
 * never migrates an installed copy.
 *
 * @module dsh-openspec-flow/skills
 */

import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Plugin manifest, read for the version stamped into each skill. */
const MANIFEST_PATH = fileURLToPath(new URL('../package.json', import.meta.url))

/** The plugin version. */
export const PLUGIN_VERSION = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')).version

/** Value every packaged skill records in `metadata.generatedBy`. */
export const GENERATED_BY = `dsh-openspec-flow@${PLUGIN_VERSION}`

/** Skills the plugin ships, in catalog order. */
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

/**
 * Absolute path of one packaged skill.
 * @param name - skill name.
 * @returns the path.
 */
export function packagedSkillPath(name) {
  return join(PACKAGED_ROOT, name, 'SKILL.md')
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
