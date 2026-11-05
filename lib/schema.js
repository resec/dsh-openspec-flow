/**
 * Schema support boundary.
 *
 * OpenSpec resolves a schema from the project, the user data directory, then
 * the CLI package. The plugin is built against one CLI version and does not
 * implement a schema compatibility contract, so it accepts only the package's
 * built-in `spec-driven` copy. A project or user schema with the same name
 * shadows that copy and is rejected as well.
 *
 * The check mirrors the documented resolution order instead of running
 * `schema which`: it adds no CLI process to the status or apply loop, and it
 * works for store roots, where `schema which` has no `--store` option.
 *
 * @module dsh-openspec-flow/schema
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** The only schema name the plugin supports. */
export const BUILTIN_SCHEMA = 'spec-driven'

/**
 * Resolve the user schema directory the CLI scans.
 *
 * Mirrors `getGlobalDataDir()` in @fission-ai/openspec: `$XDG_DATA_HOME`
 * wins, Windows falls back to `%LOCALAPPDATA%`, and other platforms use
 * `~/.local/share`.
 *
 * @param env - environment to read; defaults to `process.env`.
 * @param platform - platform to treat as Windows; defaults to `process.platform`.
 * @returns the user schema directory.
 */
export function userSchemasDir(env = process.env, platform = process.platform) {
  const xdgDataHome = env.XDG_DATA_HOME
  if (typeof xdgDataHome === 'string' && xdgDataHome !== '') {
    return join(xdgDataHome, 'openspec', 'schemas')
  }
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA
    const base = typeof localAppData === 'string' && localAppData !== ''
      ? localAppData
      : join(homedir(), 'AppData', 'Local')
    return join(base, 'openspec', 'schemas')
  }
  return join(homedir(), '.local', 'share', 'openspec', 'schemas')
}

/**
 * Build the unsupported-schema error.
 * @param change - change name.
 * @param schemaName - schema the change selected.
 * @returns an actionable error.
 */
function unsupportedSchema(change, schemaName) {
  return new Error(
    `Unsupported OpenSpec schema '${schemaName}' for change '${change}': `
    + `dsh-openspec-flow only supports the CLI's built-in '${BUILTIN_SCHEMA}' schema. `
    + 'Remove the schema selection from .openspec.yaml or openspec/config.yaml, '
    + 'or use a spec-driven change.',
  )
}

/**
 * Build the shadowed-schema error.
 * @param change - change name.
 * @param source - `project` or `user`.
 * @param path - shadowing `schema.yaml` path.
 * @returns an actionable error.
 */
function shadowedSchema(change, source, path) {
  return new Error(
    `Unsupported OpenSpec schema source for change '${change}': '${BUILTIN_SCHEMA}' is `
    + `shadowed by the ${source} schema at '${path}'. `
    + `dsh-openspec-flow only supports the CLI's built-in '${BUILTIN_SCHEMA}' schema. `
    + 'Remove that schema directory or use the built-in copy.',
  )
}

/**
 * Resolve the planning root from a `status --json` payload.
 *
 * `planningHome.root` is the CLI's authoritative value; `changeRoot` is
 * `<root>/openspec/changes/<name>`, so three levels up is the same root when
 * the summary is absent.
 *
 * @param json - parsed status payload.
 * @returns the project or store root, or an empty string.
 */
export function projectRootFromStatus(json) {
  if (json !== null && typeof json === 'object') {
    const planningRoot = json.planningHome?.root
    if (typeof planningRoot === 'string' && planningRoot !== '') return planningRoot
    if (typeof json.changeRoot === 'string' && json.changeRoot !== '') {
      return resolve(json.changeRoot, '../../..')
    }
  }
  return ''
}

/**
 * Reject a change whose resolved schema is not the package built-in.
 *
 * The caller passes the project root resolved from the CLI payload. When the
 * root is unavailable the gate fails closed rather than assuming the package
 * copy is in use.
 *
 * @param schemaName - schema name reported by `status` or `instructions apply`.
 * @param projectRoot - planning root that owns the change.
 * @param change - change name, used in the error.
 * @returns nothing when the schema is the built-in copy.
 * @throws Error naming the unsupported schema or its shadow path.
 */
export function assertBuiltinSchema(schemaName, projectRoot, change) {
  if (typeof schemaName !== 'string' || schemaName.trim() === '') {
    throw new Error(`Cannot verify the schema source for change '${change}': the CLI reported no schema name.`)
  }
  if (schemaName !== BUILTIN_SCHEMA) {
    throw unsupportedSchema(change, schemaName)
  }
  if (typeof projectRoot !== 'string' || projectRoot === '') {
    throw new Error(
      `Cannot verify the schema source for change '${change}': no project root was resolved. `
      + `dsh-openspec-flow only supports the CLI's built-in '${BUILTIN_SCHEMA}' schema.`,
    )
  }
  const projectSchema = join(projectRoot, 'openspec', 'schemas', schemaName, 'schema.yaml')
  if (existsSync(projectSchema)) {
    throw shadowedSchema(change, 'project', projectSchema)
  }
  const userSchema = join(userSchemasDir(), schemaName, 'schema.yaml')
  if (existsSync(userSchema)) {
    throw shadowedSchema(change, 'user', userSchema)
  }
}
