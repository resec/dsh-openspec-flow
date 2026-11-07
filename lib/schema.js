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

import { existsSync, readFileSync } from 'node:fs'
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

/**
 * Normalize the scalar on a top-level `schema:` line.
 * @param raw - text after the colon.
 * @returns the unquoted value without an inline comment.
 */
function normalizeYamlScalar(raw) {
  const value = raw.trim()
  if (value.startsWith('"') || value.startsWith("'")) {
    const quote = value[0]
    const end = value.indexOf(quote, 1)
    if (end !== -1) return value.slice(1, end)
  }
  const comment = value.indexOf('#')
  return (comment === -1 ? value : value.slice(0, comment)).trim()
}

/**
 * Read the project's top-level schema selection.
 *
 * Only the simple scalar form OpenSpec writes is parsed. A missing config
 * returns undefined; an unreadable config throws so a write tool can fail
 * closed instead of creating a change it cannot verify.
 *
 * @param root - resolved OpenSpec root.
 * @returns `{ path, value }` when a config contains a schema line, or undefined.
 * @throws Error when a config exists but cannot be read.
 */
export function readProjectSchema(root) {
  if (typeof root !== 'string' || root === '') return undefined
  const candidates = [
    join(root, 'openspec', 'config.yaml'),
    join(root, 'openspec', 'config.yml'),
  ]
  const path = candidates.find((candidate) => existsSync(candidate))
  if (path === undefined) return undefined
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Cannot read '${path}' to verify the project schema: ${detail}`)
  }
  const match = /^schema[ \t]*:[ \t]*(.*)$/mu.exec(text)
  if (match === null) return { path, value: '' }
  return { path, value: normalizeYamlScalar(match[1]) }
}

/**
 * Check that a new change would use the only supported schema.
 *
 * The project's configured schema is checked first so a mismatch fails
 * before the create command runs. The existing shadow check then rejects a
 * project or user copy of `spec-driven`; both checks run before any write.
 *
 * @param root - resolved OpenSpec root.
 * @param change - requested change name, used in errors.
 * @returns nothing when a new change can use the built-in schema.
 * @throws Error naming the configured schema or the shadow path.
 */
export function assertNewChangeSchema(root, change) {
  let selected
  try {
    selected = readProjectSchema(root)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Cannot verify the project schema for new change '${change}': ${detail}`)
  }
  if (selected !== undefined && selected.value !== '' && selected.value !== BUILTIN_SCHEMA) {
    throw new Error(
      `Unsupported OpenSpec schema '${selected.value}' in '${selected.path}' for new change '${change}': `
      + `dsh-openspec-flow only supports the built-in '${BUILTIN_SCHEMA}' schema. `
      + `Change the project schema selection to '${BUILTIN_SCHEMA}' or create the change with the OpenSpec CLI.`,
    )
  }
  assertBuiltinSchema(BUILTIN_SCHEMA, root, change)
}

/**
 * Check the schema reported by a completed create command.
 *
 * The create command is called with an explicit `--schema`, so a mismatch
 * means the CLI did not honor it; the tool reports that instead of returning
 * a change the rest of the plugin cannot use.
 *
 * @param schema - reported change schema.
 * @param change - requested change name, used in the error.
 * @returns nothing when the reported schema is the supported one.
 * @throws Error naming the reported and supported schemas.
 */
export function assertCreatedChangeSchema(schema, change) {
  if (schema !== BUILTIN_SCHEMA) {
    throw new Error(
      `openspec new change returned schema '${String(schema)}' for '${change}', `
      + `but dsh-openspec-flow only supports the built-in '${BUILTIN_SCHEMA}' schema. `
      + 'Remove the new change and retry after correcting the project schema.',
    )
  }
}
