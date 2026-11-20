/**
 * Shared archive operation for the archive tool and worktree land.
 *
 * @module dsh-openspec-flow/archive
 */

import { errorFromStatus, runOpenSpec, throwIfOnlyStatus, withStore } from './openspec.js'
import { projectValidate } from './state.js'

/**
 * Validate and archive one change through the bundled CLI.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - OpenSpec root directory.
 * @param change - change name.
 * @param store - optional store id.
 * @param signal - cancellation.
 * @param options - skipSpecs.
 * @returns `{ valid, issues?, json?, list, rootPath }`.
 */
export async function archiveInProject(ctx, settings, cwd, change, store, signal, options = {}) {
  const list = await runOpenSpec(ctx, settings, cwd, withStore(['list', '--json'], store), signal)
  const rootPath = list.json.root?.path ?? ''
  const changes = Array.isArray(list.json.changes) ? list.json.changes : []
  const entry = changes.find((candidate) => candidate.name === change)
  if (entry !== undefined) {
    const total = Number(entry.totalTasks) || 0
    const completed = Number(entry.completedTasks) || 0
    if (completed < total) {
      throw new Error(`Change '${change}' still has ${total - completed} incomplete task(s). Finish them before archiving.`)
    }
  }
  const validation = await runOpenSpec(
    ctx,
    settings,
    cwd,
    withStore(['validate', change, '--json'], store),
    signal,
  )
  throwIfOnlyStatus(validation.json, ['items'])
  const report = projectValidate(validation.json, change)
  if (!report.valid) return { valid: false, issues: report.issues, list, rootPath }
  const command = ['archive', change, '--yes', '--json']
  if (options.skipSpecs === true) command.push('--skip-specs')
  const { json } = await runOpenSpec(ctx, settings, cwd, withStore(command, store), signal)
  if (json.archive === null || json.archive === undefined || typeof json.archive !== 'object') {
    if (Array.isArray(json.status) && json.status.length > 0) throw errorFromStatus(json.status)
    throw new Error('openspec archive returned no archive result.')
  }
  return { valid: true, json, list, rootPath }
}
