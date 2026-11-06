/**
 * Private DSH home for one evaluation matrix.
 *
 * The home contains the generated `headless` profile, the credentials copy and
 * the session/log roots. Both roots carry a marker so cleanup can refuse an
 * unmarked directory instead of deleting user data.
 *
 * @module eval/lib/dsh-home
 */

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { EVAL_ROOT, REPO_ROOT } from './paths.mjs'

/** Default private DSH home. */
export const DEFAULT_DSH_HOME = join(EVAL_ROOT, '.dsh-home')

/** Default private agents home. */
export const DEFAULT_AGENTS_HOME = join(EVAL_ROOT, '.agents-home')

/** Default source of the stored credentials. */
export const DEFAULT_SOURCE_HOME = join(homedir(), '.dsh')

const MARKER = '.eval-home.json'
const DSH_KIND = 'dsh-home'
const AGENTS_KIND = 'agents-home'

const PROFILE_PATCH = `# Isolated evaluation profile: restore stored DeepSeek account
# authentication and pin the model for reproducible real-model runs.
- id: credentials
  disabled: false
- id: authorization
  disabled: false
- id: deepseek-account
  disabled: false
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: deepseek-account
    model: deepseek-flash
    reasoningEffort: high
`

function markerPath(root) {
  return join(root, MARKER)
}

function writeMarker(root, kind) {
  writeFileSync(
    markerPath(root),
    `${JSON.stringify({ kind, createdBy: 'dsh-openspec-flow/eval', createdAt: new Date().toISOString() }, null, 2)}\n`,
  )
}

function readMarker(root) {
  const path = markerPath(root)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function prepareRoot(root, kind) {
  if (existsSync(root)) {
    const marker = readMarker(root)
    if (marker === null || marker.kind !== kind) {
      throw new Error(`refusing to replace an unmarked directory: ${root}`)
    }
    rmSync(root, { recursive: true, force: true })
  }
  mkdirSync(root, { recursive: true })
  writeMarker(root, kind)
}

function writeProfile(root, repoRoot) {
  const profileDir = join(root, 'profiles', 'headless')
  const nodeModules = join(profileDir, 'node_modules')
  mkdirSync(nodeModules, { recursive: true })
  writeFileSync(
    join(profileDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'dsh-profile-headless-eval',
        private: true,
        dependencies: { 'dsh-openspec-flow': `link:${repoRoot}` },
        dsh: {
          profile: {
            bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless', 'dsh-openspec-flow'],
          },
        },
      },
      null,
      2,
    )}\n`,
  )
  symlinkSync(repoRoot, join(nodeModules, 'dsh-openspec-flow'), 'dir')
  writeFileSync(join(profileDir, 'cordis.patch.yml'), PROFILE_PATCH)
  mkdirSync(join(root, 'sessions'), { recursive: true })
  mkdirSync(join(root, 'logs'), { recursive: true })
  return profileDir
}

/**
 * Create both private roots, the generated profile and the credentials copy.
 *
 * @param options - root, agents root, source home and repository root.
 * @returns the created roots and profile path.
 */
export function createEvalHome({
  root = DEFAULT_DSH_HOME,
  agentsRoot = DEFAULT_AGENTS_HOME,
  sourceHome = DEFAULT_SOURCE_HOME,
  repoRoot = REPO_ROOT,
} = {}) {
  const dshHome = resolve(root)
  const agentsHome = resolve(agentsRoot)
  const source = resolve(sourceHome)
  const credentials = join(source, '.credentials.yaml')
  if (!existsSync(credentials)) {
    throw new Error(
      `credentials not found at ${credentials}; copy the stored login there or pass --source-home`,
    )
  }

  try {
    prepareRoot(dshHome, DSH_KIND)
    prepareRoot(agentsHome, AGENTS_KIND)
    mkdirSync(join(agentsHome, 'skills'), { recursive: true })
    const profile = writeProfile(dshHome, repoRoot)
    const target = join(dshHome, '.credentials.yaml')
    copyFileSync(credentials, target)
    chmodSync(target, 0o600)
    return { dshHome, agentsHome, profile, sourceHome: source }
  } catch (error) {
    cleanupEvalHome({ dshHome, agentsHome })
    throw error
  }
}

/**
 * Remove marked private roots.
 * @param options - roots to remove.
 */
export function cleanupEvalHome({ dshHome = DEFAULT_DSH_HOME, agentsHome = DEFAULT_AGENTS_HOME } = {}) {
  for (const [root, kind] of [
    [resolve(dshHome), DSH_KIND],
    [resolve(agentsHome), AGENTS_KIND],
  ]) {
    if (!existsSync(root)) continue
    const marker = readMarker(root)
    if (marker === null || marker.kind !== kind) {
      throw new Error(`refusing to remove an unmarked directory: ${root}`)
    }
    rmSync(root, { recursive: true, force: true })
  }
}

/**
 * Set both home variables and return their previous values.
 * @param roots - created private roots.
 * @returns the previous environment values.
 */
export function applyHomeEnv({ dshHome, agentsHome }) {
  const previous = {
    DSH_HOME: process.env.DSH_HOME,
    DSH_AGENTS_HOME: process.env.DSH_AGENTS_HOME,
  }
  process.env.DSH_HOME = dshHome
  process.env.DSH_AGENTS_HOME = agentsHome
  return previous
}

/**
 * Restore the environment values saved by `applyHomeEnv`.
 * @param previous - saved values.
 */
export function restoreHomeEnv(previous) {
  for (const [key, value] of Object.entries(previous ?? {})) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

/**
 * Report whether a directory carries the expected harness marker.
 * @param root - directory to inspect.
 * @param kind - expected marker kind.
 * @returns true for a harness-owned root.
 */
export function isOwnedRoot(root, kind) {
  const marker = readMarker(resolve(root))
  return marker !== null && marker.kind === kind
}

export { DSH_KIND, AGENTS_KIND, MARKER }

/**
 * Remove every marked evaluation home directly under a directory.
 * @param options - directory to scan.
 * @returns removed paths.
 */
export function cleanupStaleHomes({ root = EVAL_ROOT } = {}) {
  const removed = []
  if (!existsSync(root)) return removed
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const full = join(root, entry.name)
    if (entry.name.startsWith('.dsh-home') && isOwnedRoot(full, DSH_KIND)) {
      rmSync(full, { recursive: true, force: true })
      removed.push(full)
    } else if (entry.name.startsWith('.agents-home') && isOwnedRoot(full, AGENTS_KIND)) {
      rmSync(full, { recursive: true, force: true })
      removed.push(full)
    }
  }
  return removed
}
