/**
 * Stage detection for the full propose -> apply -> archive flow.
 *
 * The fixture is the source of truth: the harness never infers the stage from
 * assistant prose, so the same driver works for both arms and for a model that
 * advances several stages in one round.
 *
 * @module eval/lib/flow
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Ordering used to decide whether a round advanced. */
export const STAGE_RANK = Object.freeze({
  'no-change': 0,
  created: 1,
  applied: 2,
  archived: 3,
})

/**
 * Count tracked checkboxes in a tasks document.
 * @param text - tasks.md content.
 * @returns total, checked and unchecked counts.
 */
export function countTasks(text) {
  const lines = text.split('\n')
  let total = 0
  let checked = 0
  for (const line of lines) {
    const match = /^\s*-\s*\[([ xX])\]/u.exec(line)
    if (match === null) continue
    total += 1
    if (match[1].toLowerCase() === 'x') checked += 1
  }
  return { total, checked, unchecked: total - checked }
}

function readTasks(changeDir) {
  const path = join(changeDir, 'tasks.md')
  if (!existsSync(path)) return { total: 0, checked: 0, unchecked: 0 }
  return countTasks(readFileSync(path, 'utf8'))
}

function listChanges(fixtureDir) {
  const root = join(fixtureDir, 'openspec', 'changes')
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive')
    .map((entry) => entry.name)
    .sort()
}

function archivedName(fixtureDir, expectedName) {
  const root = join(fixtureDir, 'openspec', 'changes', 'archive')
  if (!existsSync(root)) return null
  return (
    readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .find((name) => name === expectedName || name.endsWith(`-${expectedName}`)) ?? null
  )
}

function artifacts(changeDir) {
  const names = ['proposal.md', 'design.md', 'tasks.md']
  const present = names.filter((name) => existsSync(join(changeDir, name)))
  const specsDir = join(changeDir, 'specs')
  const hasSpecs =
    existsSync(specsDir) &&
    statSync(specsDir).isDirectory() &&
    readdirSync(specsDir).some((entry) => existsSync(join(specsDir, entry, 'spec.md')))
  return { present, hasSpecs, complete: present.length === names.length && hasSpecs }
}

/**
 * Inspect a fixture and report its current flow stage.
 * @param fixtureDir - fixture repository root.
 * @param expectedName - the change name the request asks for.
 * @returns stage, change name, task counts and artifact presence.
 */
export function inspectStage(fixtureDir, expectedName) {
  const changes = listChanges(fixtureDir)
  const archived = expectedName ? archivedName(fixtureDir, expectedName) : null
  const expectedActive = expectedName !== undefined && changes.includes(expectedName)

  if (!expectedActive) {
    if (archived !== null) {
      const archivedDir = join(fixtureDir, 'openspec', 'changes', 'archive', archived)
      return {
        stage: 'archived',
        change: expectedName,
        archivedAs: archived,
        tasks: readTasks(archivedDir),
        artifacts: artifacts(archivedDir),
      }
    }
    return {
      stage: 'no-change',
      change: null,
      archivedAs: null,
      tasks: { total: 0, checked: 0, unchecked: 0 },
      artifacts: { present: [], hasSpecs: false, complete: false },
    }
  }

  const changeDir = join(fixtureDir, 'openspec', 'changes', expectedName)
  const tasks = readTasks(changeDir)
  const changeArtifacts = artifacts(changeDir)
  if (archived !== null) {
    return {
      stage: 'archived',
      change: expectedName,
      archivedAs: archived,
      tasks,
      artifacts: changeArtifacts,
    }
  }
  const stage = tasks.total > 0 && tasks.unchecked === 0 ? 'applied' : 'created'
  return { stage, change: expectedName, archivedAs: null, tasks, artifacts: changeArtifacts }
}

/**
 * Pick the next scripted user message for a stage.
 * @param stage - current stage.
 * @param confirmations - confirmation messages.
 * @returns the message, or null when the flow is done.
 */
export function nextMessage(stage, confirmations) {
  switch (stage) {
    case 'no-change':
      return confirmations.create
    case 'created':
      return confirmations.apply
    case 'applied':
      return confirmations.archive
    default:
      return null
  }
}

/**
 * Classify a round from the user message that started it.
 * @param message - user message used for the round.
 * @param confirmations - confirmation messages.
 * @returns `initial`, `confirmation` or `work`.
 */
export function classifyRound(message, confirmations) {
  if (typeof message !== 'string') return 'work'
  return Object.values(confirmations).includes(message) ? 'confirmation' : 'work'
}

/**
 * Whether a stage transition counts as progress.
 * @param previous - earlier stage.
 * @param next - later stage.
 * @returns true when the rank increased.
 */
export function hasProgress(previous, next) {
  return (STAGE_RANK[next] ?? -1) > (STAGE_RANK[previous] ?? -1)
}
