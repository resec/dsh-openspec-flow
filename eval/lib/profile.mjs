/**
 * Arm composition and preflight checks.
 *
 * Both arms use the same headless profile. Only the OpenSpec plugin row and
 * the multi-agent rows are patched, so model, tools and permissions stay
 * identical.
 *
 * @module eval/lib/profile
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DSH_BIN, openspecBin, PATCHES_ROOT, PROFILE } from './paths.mjs'

const SUBAGENT_ROWS = [
  'subagent',
  'subagent-spawn-in-process',
  'subagent-fork-in-process',
  'tool-subagent-control',
  'tool-subagent',
  'tool-subagent-fork',
  'tool-workflow',
]

/**
 * Absolute patch paths for one arm.
 * @param arm - `official` or `plugin`.
 * @returns patch paths in application order.
 */
export function patchesForArm(arm) {
  const plugin = arm === 'official' ? 'plugin-off.yml' : 'plugin-on.yml'
  return [join(PATCHES_ROOT, plugin), join(PATCHES_ROOT, 'no-subagents.yml')]
}

/**
 * Parse the relevant rows out of a `--dump-config` YAML export.
 *
 * The dump is a flat list of `- id:` entries. Only the fields the preflight
 * checks are extracted, so no YAML dependency is introduced.
 *
 * @param text - dump-config output.
 * @returns map of id to `{ name, disabled, config }`.
 */
export function parseDump(text) {
  const entries = new Map()
  let current = null
  for (const line of text.split('\n')) {
    const idMatch = /^- id: (\S+)\s*$/u.exec(line)
    if (idMatch !== null) {
      current = { id: idMatch[1], name: null, disabled: null, config: {} }
      entries.set(current.id, current)
      continue
    }
    if (current === null) continue
    const nameMatch = /^\s+name: (.+)$/u.exec(line)
    if (nameMatch !== null && current.name === null) {
      current.name = nameMatch[1].trim().replace(/^['"]|['"]$/gu, '')
      continue
    }
    const disabledMatch = /^\s+disabled:\s*(true|false)\s*$/u.exec(line)
    if (disabledMatch !== null) {
      current.disabled = disabledMatch[1] === 'true'
      continue
    }
    const fieldMatch = /^\s{4}(provider|model|reasoningEffort):\s*(\S+)\s*$/u.exec(line)
    if (fieldMatch !== null) {
      current.config[fieldMatch[1]] = fieldMatch[2]
    }
  }
  return entries
}

/**
 * Check a parsed dump against the arm and model requirements.
 * @param entries - parsed dump.
 * @param options - arm and expected model.
 * @returns issue strings; empty when the composition matches.
 */
export function checkDump(entries, { arm, model }) {
  const issues = []
  const plugin = entries.get('openspec-flow')
  if (plugin === undefined) {
    issues.push('openspec-flow row is missing')
  } else if (arm === 'official' && plugin.disabled !== true) {
    issues.push('openspec-flow must be disabled for the official arm')
  } else if (arm === 'plugin' && plugin.disabled === true) {
    issues.push('openspec-flow must be enabled for the plugin arm')
  }

  for (const id of SUBAGENT_ROWS) {
    const entry = entries.get(id)
    if (entry === undefined) {
      issues.push(`${id} row is missing`)
    } else if (entry.disabled !== true) {
      issues.push(`${id} must be disabled`)
    }
  }

  const modelRow = entries.get('agent-default-model')
  if (modelRow === undefined) {
    issues.push('agent-default-model row is missing')
  } else {
    for (const key of ['provider', 'model', 'reasoningEffort']) {
      if (modelRow.config[key] !== model[key]) {
        issues.push(`model ${key} is ${modelRow.config[key] ?? 'unset'}, expected ${model[key]}`)
      }
    }
  }
  return issues
}

/**
 * Run `--dump-config` for one arm.
 * @param options - arm, model, launcher and environment overlay.
 * @returns dump text.
 */
export function dumpConfig({ arm, model, dshBin = DSH_BIN, env = {} }) {
  const patches = patchesForArm(arm)
  const args = ['--profile', PROFILE]
  for (const patch of patches) args.push('--patch', patch)
  args.push('--dump-config')
  const result = spawnSync(dshBin, args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  if (result.status !== 0) {
    throw new Error(`dsh --dump-config failed: ${result.stderr || result.stdout}`)
  }
  return result.stdout
}

/**
 * Full preflight for one arm: composition, model, CLI and tool surface.
 * @param options - arm, model, launcher and environment overlay.
 * @returns issue strings.
 */
export function preflight({ arm, model, dshBin = DSH_BIN, env = {} }) {
  const issues = checkDump(parseDump(dumpConfig({ arm, model, dshBin, env })), { arm, model })
  try {
    openspecBin()
  } catch (error) {
    issues.push(error.message)
  }
  return issues
}

/**
 * Check a real request header against the arm's expected tool surface.
 * @param summary - session summary.
 * @param arm - `official` or `plugin`.
 * @returns issue strings.
 */
export function assertToolSurface(summary, arm) {
  const issues = []
  const surface = summary.toolSurface
  if (surface.hasSubagent) issues.push('subagent tools are present')
  if (!surface.hasWeb) issues.push('web tools are missing')
  if (arm === 'official' && surface.openspecTools.length !== 0) {
    issues.push(`official arm exposes ${surface.openspecTools.join(', ')}`)
  }
  if (arm === 'plugin' && surface.openspecTools.length < 10) {
    issues.push(`plugin arm exposes only ${surface.openspecTools.length} openspec tools`)
  }
  return issues
}

/**
 * Read a recorded dump fixture.
 * @param name - file name under `eval/fixtures/dumps/`.
 * @returns dump text.
 */
export function readDumpFixture(name) {
  return readFileSync(join(PATCHES_ROOT, '..', 'fixtures', 'dumps', name), 'utf8')
}
