/**
 * Package-under-test packing and isolated profile installation.
 *
 * The lab packs the working tree, installs that tarball into a fresh profile
 * and verifies the bundle selection and composed configuration. It never
 * writes `dist/`.
 */

import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ROOT, resolveNpmCache } from './paths.mjs'
import { run } from './process.mjs'

/**
 * Pack the working tree into a run directory.
 * @param options - repository root, output directory and environment.
 * @returns `{ tarball, version, name, sha512, dirty, head }`.
 */
export function packPlugin({ root = ROOT, outDir, env = process.env } = {}) {
  if (outDir === undefined) throw new Error('packPlugin needs outDir')
  mkdirSync(outDir, { recursive: true })
  const result = run('npm', ['pack', '--json', '--pack-destination', outDir], {
    cwd: root,
    timeoutMs: 120_000,
    env: { ...env, npm_config_cache: resolveNpmCache({ env }) },
  })
  if (result.status !== 0) throw new Error(`npm pack failed: ${(result.stderr || result.stdout).slice(-2_000)}`)
  const parsed = JSON.parse(result.stdout)
  const entry = Array.isArray(parsed) ? parsed[0] : parsed
  if (entry === undefined || typeof entry.filename !== 'string') throw new Error('npm pack returned no filename')
  const tarball = join(outDir, entry.filename)
  return {
    tarball,
    version: String(entry.version),
    name: String(entry.name),
    sha512: createHash('sha512').update(readFileSync(tarball)).digest('base64'),
    dirty: gitDirty(root),
    head: gitHead(root),
  }
}

/**
 * List the working tree's uncommitted paths and resolve HEAD.
 * @param root - repository root.
 * @returns `{ dirty, paths }`.
 */
export function gitDirty(root = ROOT) {
  const status = run('git', ['status', '--porcelain'], { cwd: root, timeoutMs: 30_000 })
  if (status.status !== 0) return { dirty: true, paths: ['git status failed'] }
  return {
    dirty: status.stdout.trim() !== '',
    paths: status.stdout.split('\n').map((line) => line.slice(3).trim()).filter(Boolean),
  }
}

/**
 * Read the current HEAD commit.
 * @param root - repository root.
 * @returns the commit, or `unknown`.
 */
export function gitHead(root = ROOT) {
  const result = run('git', ['rev-parse', 'HEAD'], { cwd: root, timeoutMs: 30_000 })
  return result.status === 0 ? result.stdout.trim() : 'unknown'
}

/**
 * Install the tarball into one profile and verify its composition.
 * @param options - DSH bin, profile, tarball, offline and environment.
 * @returns `{ profileDirectory, bundles, dump, name, version }`.
 */
export function installPlugin({ dshBin, profile, tarball, offline = false, env = process.env, home, node = process.execPath }) {
  const args = [dshBin, 'plugin', '--profile', profile, 'add']
  if (offline) args.push('--offline')
  args.push(`file:${resolve(tarball)}`)
  const installed = run(node, args, {
    timeoutMs: 10 * 60_000,
    env: { ...env, npm_config_cache: resolveNpmCache({ env }) },
  })
  if (installed.status !== 0) {
    throw new Error(`dsh plugin add failed: ${(installed.stderr || installed.stdout).slice(-2_000)}`)
  }
  const storeMatch = /Content-addressable store is at:\s*(\S+)/.exec(`${installed.stdout}\n${installed.stderr}`)
  const profileDirectory = join(home, 'profiles', profile)
  const manifest = readProfile(profileDirectory)
  const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : []
  const dependency = findBundleDependency(profileDirectory, manifest)
  const dump = dumpConfig({ dshBin, profile, env, node })
  if (dependency === undefined) throw new Error('the installed profile does not declare a bundle dependency')
  if (!bundles.includes(dependency.name)) throw new Error(`the installed tarball did not add bundle ${dependency.name}`)
  if (!dump.includes(dependency.name)) throw new Error(`the composed configuration does not contain ${dependency.name}`)
  return { profileDirectory, bundles, dump, name: dependency.name, version: dependency.version, store: storeMatch?.[1] }
}

/**
 * Read one profile manifest.
 * @param directory - profile directory.
 * @returns parsed package.json.
 */
export function readProfile(directory) {
  return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
}

/**
 * Run `--dump-config` for one profile.
 * @param options - DSH bin, profile, environment and Node.
 * @returns the composed tree as text.
 */
export function dumpConfig({ dshBin, profile, env = process.env, node = process.execPath }) {
  const result = run(node, [dshBin, '--profile', profile, '--dump-config'], {
    timeoutMs: 120_000,
    env,
  })
  if (result.status !== 0) throw new Error(`--dump-config failed: ${(result.stderr || result.stdout).slice(-2_000)}`)
  return result.stdout
}

function findBundleDependency(directory, manifest) {
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    try {
      const installed = JSON.parse(readFileSync(join(directory, 'node_modules', name, 'package.json'), 'utf8'))
      if (installed.dsh?.bundle !== undefined) return { name, version: String(version) }
    } catch {
      // Not a bundle dependency, or not installed yet.
    }
  }
  return undefined
}

/**
 * Write the lab mock model patch into a profile.
 * @param directory - profile directory.
 * @param baseURL - mock base URL.
 * @returns the patch path.
 */
export function writeMockPatch(directory, baseURL) {
  const path = join(directory, 'cordis.patch.yml')
  const text = [
    '',
    '- id: llm-pi-ai',
    '  config:',
    '    providers:',
    '      lab-mock:',
    '        apiKeyEnv: LAB_MOCK_KEY',
    '        api: openai-completions',
    `        baseURL: ${baseURL}/v1`,
    '        models:',
    '          - id: lab-mock',
    '- id: agent-default-model',
    '  config:',
    '    provider: lab-mock',
    '    model: lab-mock',
    '',
  ].join('\n')
  const target = existsSync(path) ? path : join(directory, 'cordis.patch.yml')
  mkdirSync(directory, { recursive: true })
  const existing = existsSync(target) ? readFileSync(target, 'utf8') : ''
  const effective = existing
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
    .trim()
  if (effective === '' || effective === '[]') writeFileSync(target, text.replace(/^\n/, ''))
  else appendFileSync(target, text)
  return target
}
