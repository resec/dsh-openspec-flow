/**
 * Tool registration entry point.
 *
 * Registers the single inspect entry, the apply-loop tools, the write tools
 * and the gated management tools. The management block stays out of the
 * catalog until the user opens it with `/opsx-admin`.
 *
 * @module dsh-openspec-flow/tools
 */

import { registerApplyNextTool, registerMarkTaskDoneTool } from './apply.js'
import {
  registerInspectTool,
  registerSchemasTool,
  registerStoreListTool,
} from './query.js'
import { registerReviewTool } from './review.js'
import { registerWriteTools } from './write.js'

/**
 * Register every agent tool on the plugin's context.
 * @param ctx - host context carrying tools, subprocess and workingDirectory.
 * @param settings - resolved plugin settings.
 * @returns nothing; every registration is owned by the plugin's effect scope.
 */
export function registerTools(ctx, settings) {
  registerInspectTool(ctx, settings)
  registerApplyNextTool(ctx, settings)
  registerMarkTaskDoneTool(ctx, settings)
  registerWriteTools(ctx, settings)
  registerSchemasTool(ctx, settings)
  registerStoreListTool(ctx, settings)
  if (settings?.reviews?.draft?.enabled === true || settings?.reviews?.apply?.enabled === true) {
    registerReviewTool(ctx, settings)
  }
}
