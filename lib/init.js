/**
 * `openspec_init`: create the project structure.
 *
 * The CLI creates `openspec/config.yaml` and the OpenSpec directories with
 * `init --tools none`, so no official skill is generated. The plugin's
 * workflow skills come from its skill provider, not from files this tool
 * writes.
 *
 * @module dsh-openspec-flow/init
 */

import { accessSync, constants, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { adminToolsVisible } from './admin.js'
import { runOpenSpecCommand } from './openspec.js'
import { isDirectory } from './skills.js'
import { renderJson, sessionCwd } from './tools/shared.js'

/**
 * Register `openspec_init`.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing.
 */
export function registerInitTool(ctx, settings) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_init',
    description: 'Initialize an OpenSpec project for this plugin: create openspec/config.yaml and the OpenSpec directory structure, without generating skills. Never runs automatically; call it only when the user asks.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description: 'Project directory; defaults to the session working directory.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['root', 'config'],
        properties: {
          root: { type: 'string' },
          config: {
            type: 'string',
            enum: ['created', 'exists'],
            description: 'created means this call ran init; exists means config.yaml was already present.',
          },
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const cwd = await sessionCwd(ctx, exec)
      const target = typeof args?.path === 'string' && args.path.trim() !== ''
        ? resolve(cwd, args.path.trim())
        : cwd
      if (!isDirectory(target)) {
        throw new Error(`openspec_init target '${target}' is not a directory.`)
      }
      try {
        accessSync(target, constants.W_OK)
      } catch {
        throw new Error(`openspec_init cannot write to '${target}'. Check the directory permissions and retry.`)
      }

      const configPath = join(target, 'openspec', 'config.yaml')
      const configAltPath = join(target, 'openspec', 'config.yml')
      let config = 'exists'
      if (!existsSync(configPath) && !existsSync(configAltPath)) {
        await runOpenSpecCommand(
          ctx,
          settings,
          target,
          ['init', '--tools', 'none', '--no-animation'],
          exec.signal,
        )
        config = 'created'
      }
      return { root: target, config }
    },
  }, { when: ({ agent }) => adminToolsVisible(agent) }))
}
