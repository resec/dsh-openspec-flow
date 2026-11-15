/**
 * Reviewer-only plugin entry.
 *
 * The `openspec-reviewer` preset composes this entry with read/search/image tools.
 * It registers `openspec_reviewer` and denies every Host tool the preset does
 * not provide, so the reviewer's model-facing catalog is the seven declared
 * preset tools; `read_image` exists only while the Host mounts `attachments`
 * (the catalog is six otherwise).
 * The deny set is computed from the live global registry and refreshed when
 * that registry changes; a new Host tool must not silently join the catalog.
 *
 * @module dsh-openspec-flow/reviewer
 */

import { registerReviewerTool } from './lib/review/reviewer-tool.js'

/** Cordis plugin name. */
export const name = 'openspec-flow-reviewer'

/** Services used by the reviewer entry. */
export const inject = ['tools', 'workingDirectory']

/** Tool names the reviewer preset provides; the deny mask must not name them. */
export const PRESET_TOOL_NAMES = new Set([
  'read',
  'grep',
  'glob',
  'read_image',
  'web_search',
  'web_fetch',
  'openspec_reviewer',
])

/**
 * Deny every Host tool outside the preset.
 *
 * The deny set comes from the global registry rather than a fixed list: a
 * deployment does not need to install every Host plugin, and a changer tool
 * added later is denied by the refresh. Names in the preset are excluded so a
 * global tool with the same name cannot shadow the preset's scoped tool out of
 * the reviewer catalog.
 *
 * The refresh adds new names to the denied set before calling `restrict`.
 * `restrict` emits `tools/change` synchronously, so this ordering keeps the
 * listener from treating its own write as a new registration. A failed write
 * rolls the names back so a later `tools/change` retries them; the earlier
 * restriction stays in force.
 *
 * @param ctx - reviewer plugin context.
 * @returns the disposer of the refresh listener.
 */
function denyHostTools(ctx) {
  const denied = new Set()

  const refresh = () => {
    const names = []
    for (const tool of ctx.tools.definitions()) {
      const name = tool?.name
      if (typeof name !== 'string' || name === '') continue
      if (PRESET_TOOL_NAMES.has(name) || denied.has(name)) continue
      names.push(name)
    }
    if (names.length === 0) return
    for (const name of names) denied.add(name)
    try {
      ctx.tools.restrict({ deny: names })
    } catch (error) {
      for (const name of names) denied.delete(name)
      ctx.logger?.warn?.(
        `openspec-flow: reviewer host-tool restriction failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw error
    }
  }

  refresh()
  return ctx.effect(() => ctx.on('tools/change', () => {
    try {
      refresh()
    } catch {
      // refresh() already logged the failure and kept the earlier denial.
    }
  }))
}

/**
 * Register the reviewer tool and the host-tool denial.
 * @param ctx - reviewer plugin context.
 * @returns nothing.
 */
export function apply(ctx) {
  denyHostTools(ctx)
  registerReviewerTool(ctx)
}
