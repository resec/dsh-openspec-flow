/**
 * The plugin's `openspec-flow` skill.
 *
 * The document ships in `skills/openspec-flow/SKILL.md` and is registered as a
 * runtime skill into the calling context's layer. Runtime skills rank below a
 * project's `.dsh/skills` entries, so this skill cannot shadow an upstream
 * `openspec-apply-change`; its distinct name makes both visible and lets the
 * model choose the compact apply path.
 *
 * `ctx.skills` is optional and read through `ctx.get('skills')` so a deployment
 * without the skill registry keeps all five tools.
 *
 * @module dsh-openspec-flow/skill
 */

import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Absolute path of the shipped skill document. */
const SKILL_PATH = fileURLToPath(new URL('../skills/openspec-flow/SKILL.md', import.meta.url))

/** Longest description the session catalog renders. */
const DESCRIPTION_MAX = 500

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
 * Parse and validate the shipped skill document.
 * @param raw - file text.
 * @returns the declared name and description plus the instruction body.
 * @throws Error naming the broken rule; a bad document fails plugin activation
 *   instead of silently disappearing from the catalog.
 */
export function parseSkillDocument(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (match === null) {
    throw new Error(`openspec-flow: ${SKILL_PATH} must start with a --- frontmatter block.`)
  }
  const name = field(match[1], 'name')
  const description = field(match[1], 'description')
  if (name === undefined || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name)) {
    throw new Error(`openspec-flow: ${SKILL_PATH} must declare a kebab-case name.`)
  }
  if (description === undefined || description === '') {
    throw new Error(`openspec-flow: ${SKILL_PATH} must declare a description.`)
  }
  if (description.length > DESCRIPTION_MAX) {
    throw new Error(
      `openspec-flow: ${SKILL_PATH} has a ${description.length}-character description; the catalog renders at most ${DESCRIPTION_MAX}.`,
    )
  }
  const content = raw.slice(match[0].length).trim()
  if (content === '') {
    throw new Error(`openspec-flow: ${SKILL_PATH} has no instruction body after the frontmatter.`)
  }
  return { name, description, content }
}

/**
 * Load the shipped skill document.
 * @returns the parsed document.
 */
export function loadSkillDocument() {
  return parseSkillDocument(readFileSync(SKILL_PATH, 'utf8'))
}

/**
 * Register the skill when the deployment has a skill registry.
 * @param ctx - host context.
 * @returns nothing; the registration is an effect owned by the plugin.
 */
export function registerSkill(ctx) {
  const skills = ctx.get('skills')
  if (skills === undefined || skills === null || typeof skills.register !== 'function') {
    ctx.logger?.warn?.(
      'openspec-flow: ctx.skills is unavailable, so the openspec-flow skill is not advertised; the tools still work.',
    )
    return
  }
  const document = loadSkillDocument()
  ctx.effect(() => skills.register({
    name: document.name,
    description: document.description,
    content: document.content,
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'runtime',
    path: SKILL_PATH,
    resourceBase: { kind: 'directory', path: dirname(SKILL_PATH) },
  }))
}
