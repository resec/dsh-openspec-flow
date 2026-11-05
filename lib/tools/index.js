/**
 * Tool registration entry point.
 *
 * Registers the query tools, the apply-loop tools and the write tools in the
 * order the catalog has always used: list, status, apply_next, mark, validate.
 *
 * @module dsh-openspec-flow/tools
 */

import { registerApplyNextTool, registerMarkTaskDoneTool } from './apply.js'
import {
  registerContextTool,
  registerInstructionsTool,
  registerListTool,
  registerSchemasTool,
  registerShowTool,
  registerStatusTool,
  registerStoreListTool,
  registerValidateTool,
} from './query.js'
import { registerWriteTools } from './write.js'

/**
 * Register every agent tool on the plugin's context.
 * @param ctx - host context carrying tools, subprocess and workingDirectory.
 * @param settings - resolved plugin settings.
 * @returns nothing; every registration is owned by the plugin's effect scope.
 */
export function registerTools(ctx, settings) {
  registerListTool(ctx, settings)
  registerStatusTool(ctx, settings)
  registerShowTool(ctx, settings)
  registerInstructionsTool(ctx, settings)
  registerContextTool(ctx, settings)
  registerSchemasTool(ctx, settings)
  registerStoreListTool(ctx, settings)
  registerApplyNextTool(ctx, settings)
  registerMarkTaskDoneTool(ctx, settings)
  registerValidateTool(ctx, settings)
  registerWriteTools(ctx, settings)
}
