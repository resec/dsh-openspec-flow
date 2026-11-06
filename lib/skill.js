/**
 * The plugin's packaged skill provider.
 *
 * Every workflow skill ships in `skills/<name>/SKILL.md`. The provider offers
 * all seven at rank 50, below the filesystem provider's project roots, so the
 * packaged text wins over a project copy and an upgrade takes effect without
 * reinstalling anything. `list()` reads frontmatter only; `get()` reads the
 * body when the model or the user selects a skill.
 *
 * `ctx.skills` is optional and read through `ctx.get('skills')` so a deployment
 * without the skill registry keeps all five tools.
 *
 * @module dsh-openspec-flow/skill
 */

import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { SKILL_NAMES, packagedSkillPath } from './skills.js'

/** Provider name; `runtime` is reserved by the registry. */
const PROVIDER_NAME = 'openspec-flow'

/** Candidate rank, below the project (100) and agents (200) roots. */
export const SKILL_RANK = 50

/** Longest description the session catalog renders. */
const DESCRIPTION_MAX = 500

/** Packaged skill names in catalog order. */
export const PACKAGED_SKILL_NAMES = [...SKILL_NAMES, PROVIDER_NAME]

/**
 * Read one frontmatter field, stripping simple surrounding quotes.
 * @param block - text between the `---` lines.
 * @param key - field name.
 * @returns the value, or undefined.
 */
function field(block, key) {
  for (const line of block.split(/\r?\n/u)) {
    const separator = line.indexOf(':')
    if (separator === -1) continue
    if (line.slice(0, separator).trim() !== key) continue
    const value = line.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1)
    }
    return value
  }
  return undefined
}

/**
 * Parse and validate a packaged skill document.
 * @param raw - file text.
 * @param source - document path or label used in errors.
 * @returns the declared name and description plus the instruction body.
 * @throws Error naming the broken rule.
 */
export function parseSkillDocument(raw, source = 'skill document') {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (match === null) {
    throw new Error(`${source} must start with a --- frontmatter block.`)
  }
  const name = field(match[1], 'name')
  const description = field(match[1], 'description')
  if (name === undefined || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name)) {
    throw new Error(`${source} must declare a kebab-case name.`)
  }
  if (description === undefined || description === '') {
    throw new Error(`${source} must declare a description.`)
  }
  if (description.length > DESCRIPTION_MAX) {
    throw new Error(
      `${source} has a ${description.length}-character description; the catalog renders at most ${DESCRIPTION_MAX}.`,
    )
  }
  const content = raw.slice(match[0].length).trim()
  if (content === '') {
    throw new Error(`${source} has no instruction body after the frontmatter.`)
  }
  return { name, description, content }
}

/**
 * Load the shipped `openspec-flow` skill document.
 * @returns the parsed document.
 */
export function loadSkillDocument() {
  const path = packagedSkillPath(PROVIDER_NAME)
  return parseSkillDocument(readFileSync(path, 'utf8'), path)
}

/**
 * Read one packaged document from disk.
 * @param path - absolute document path.
 * @returns the file text.
 */
function readPackaged(path) {
  return readFileSync(path, 'utf8')
}

/**
 * Build one provider candidate from a packaged document.
 * @param name - packaged skill directory name.
 * @param read - document reader.
 * @returns the candidate, without the instruction body.
 */
function candidateFor(name, read) {
  const path = packagedSkillPath(name)
  const document = parseSkillDocument(read(path), path)
  return {
    name: document.name,
    description: document.description,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: PROVIDER_NAME,
    source: 'bundled',
    path,
    resourceBase: { kind: 'directory', path: dirname(path) },
    rank: SKILL_RANK,
    locator: path,
  }
}

/**
 * Create the provider that serves the packaged skills.
 * @param options - optional logger for skipped documents and a document reader
 *   the tests replace to exercise a malformed document.
 * @returns a provider for `ctx.skills.registerProvider`.
 */
export function createSkillProvider({ logger, read = readPackaged } = {}) {
  return {
    name: PROVIDER_NAME,
    async list() {
      const candidates = []
      for (const name of PACKAGED_SKILL_NAMES) {
        try {
          candidates.push(candidateFor(name, read))
        } catch (error) {
          logger?.warn?.(`openspec-flow: packaged skill "${name}" is skipped: ${error.message}`)
        }
      }
      return candidates
    },
    async get(candidate) {
      const path = typeof candidate?.locator === 'string'
        ? candidate.locator
        : packagedSkillPath(candidate?.name)
      let raw
      try {
        raw = read(path)
      } catch {
        return undefined
      }
      try {
        const document = parseSkillDocument(raw, path)
        return {
          name: document.name,
          description: document.description,
          content: document.content,
          invocation: { modelInvocable: true, userInvocable: true },
          provider: PROVIDER_NAME,
          source: 'bundled',
          path,
          resourceBase: { kind: 'directory', path: dirname(path) },
        }
      } catch {
        return undefined
      }
    },
  }
}

/**
 * Register the provider when the deployment has a skill registry.
 * @param ctx - host context.
 * @returns nothing; the registration is an effect owned by the plugin.
 */
export function registerSkillProvider(ctx) {
  const skills = ctx.get('skills')
  if (skills === undefined || skills === null || typeof skills.registerProvider !== 'function') {
    ctx.logger?.warn?.(
      'openspec-flow: ctx.skills cannot register a provider, so the packaged skills are not advertised; the tools still work.',
    )
    return
  }
  ctx.effect(() => skills.registerProvider(() => createSkillProvider({ logger: ctx.logger })))
}
