/**
 * Pure helpers for the Node bootstrap, its `qualifies` command and tests.
 *
 * The shell mirrors the same baseline, asset and candidate rules; its
 * --print-asset and --print-candidate-paths modes expose those values so the
 * suite can compare the shipped shell behaviour with this module. The runtime
 * verdict has one implementation: `qualifiesHostVersion` below backs the
 * `qualifies` command the shell runs for every host candidate, and the
 * bootstrap.mjs preflight enforces the same requirements through
 * node-version.mjs. Nothing here downloads, spawns a process or reads the
 * environment.
 */

import { readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { parseVersion, readNodeRequirements, satisfies } from './node-version.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Default Node distribution root. */
export const DEFAULT_MIRROR = 'https://nodejs.org/dist'

/** Supported download platforms. */
export const SUPPORTED_PLATFORMS = ['darwin', 'linux']

/** Supported Node architecture labels. */
export const SUPPORTED_ASSET_ARCHES = ['arm64', 'x64']

/** Minimum free bytes bootstrap accepts. */
export const MIN_FREE_BYTES = 3 * 1024 * 1024 * 1024

/**
 * Normalize a concrete Node version to `major.minor.patch`.
 * @param value - version with or without the v prefix.
 * @returns normalized version.
 */
export function normalizeVersion(value) {
  const parsed = parseVersion(value)
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`
}

/**
 * Read the concrete Node version recorded inside a baseline JSON document.
 * @param text - coverage.baseline.json contents.
 * @returns normalized version.
 */
export function parseBaselineNodeVersion(text) {
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('coverage.baseline.json is not valid JSON')
  }
  const recorded = value?.node?.version
  try {
    return normalizeVersion(recorded)
  } catch {
    throw new Error('coverage.baseline.json has no concrete node version')
  }
}

/**
 * Read the baseline Node version from the repository.
 * @param root - repository root.
 * @returns normalized version.
 */
export function readBaselineNodeVersion(root) {
  return parseBaselineNodeVersion(readFileSync(join(root, 'coverage.baseline.json'), 'utf8'))
}

/**
 * Whether one concrete version meets the primary major and declared range.
 * @param version - concrete version with or without the v prefix.
 * @param requirements - `{ primaryMajor, range }`.
 * @returns whether the runtime qualifies.
 */
export function qualifiesHostVersion(version, requirements) {
  const parsed = parseVersion(version)
  return parsed.major === requirements.primaryMajor && satisfies(parsed, requirements.range)
}

/**
 * Whether a platform can download a Node asset.
 * @param platform - process platform.
 * @returns whether the platform is supported.
 */
export function isSupportedPlatform(platform) {
  return SUPPORTED_PLATFORMS.includes(platform)
}

/**
 * Name the Node tarball for one version and platform.
 * @param options - version, platform and asset architecture.
 * @returns the asset filename.
 */
export function assetName({ version, platform, arch }) {
  if (!isSupportedPlatform(platform)) {
    throw new Error(`unsupported platform: ${platform}`)
  }
  if (!SUPPORTED_ASSET_ARCHES.includes(arch)) {
    throw new Error(`unsupported architecture: ${arch}`)
  }
  return `node-v${normalizeVersion(version)}-${platform}-${arch}.tar.gz`
}

/**
 * Build the Node download URL.
 * @param options - version, platform, architecture and optional mirror.
 * @returns the download URL.
 */
export function assetUrl({ version, platform, arch, mirror = DEFAULT_MIRROR }) {
  const asset = assetName({ version, platform, arch })
  return `${String(mirror).replace(/\/+$/, '')}/v${normalizeVersion(version)}/${asset}`
}

/**
 * Build the SHASUMS256.txt URL for one version.
 * @param version - concrete version.
 * @param mirror - distribution root.
 * @returns the checksum URL.
 */
export function shasumsUrl(version, mirror = DEFAULT_MIRROR) {
  return `${String(mirror).replace(/\/+$/, '')}/v${normalizeVersion(version)}/SHASUMS256.txt`
}

/**
 * Read the checksum for one asset from a SHASUMS256.txt body.
 * @param text - checksum file contents.
 * @param asset - exact asset filename.
 * @returns the sha256, or undefined.
 */
export function parseShasum(text, asset) {
  for (const line of String(text).split('\n')) {
    const match = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/.exec(line)
    if (match !== null && match[2] === asset) return match[1]
  }
  return undefined
}

/**
 * List the global install roots bootstrap may inspect without invoking a manager.
 * @param options - home directory and platform.
 * @returns named roots and Homebrew binary paths.
 */
export function globalCandidateRoots({ home = homedir(), platform = process.platform } = {}) {
  const brew = platform === 'darwin'
    ? ['/opt/homebrew/opt/node@24/bin/node', '/usr/local/opt/node@24/bin/node']
    : ['/home/linuxbrew/.linuxbrew/opt/node@24/bin/node']
  return {
    fnm: join(home, '.local/share/fnm/node-versions'),
    nvm: join(home, '.nvm/versions/node'),
    volta: join(home, '.volta/tools/image/node'),
    asdf: join(home, '.asdf/installs/nodejs'),
    brew,
  }
}

/**
 * Answer whether one version satisfies the repository's Node requirements.
 * @param argv - command and version, as `qualifies <version>`.
 * @param root - repository root holding package.json and coverage.config.json.
 * @returns process exit code: 0 satisfies, 1 does not, 2 unusable input.
 */
export function runQualifiesCommand(argv, root = ROOT) {
  const [command, version] = argv
  if (command !== 'qualifies' || version === undefined) {
    process.stderr.write('usage: bootstrap-lib.mjs qualifies <version>\n')
    return 2
  }
  try {
    return qualifiesHostVersion(version, readNodeRequirements(root)) ? 0 : 1
  } catch (error) {
    process.stderr.write(`bootstrap: ${error.message}\n`)
    return 2
  }
}

/**
 * Whether this module is the script the process was started with.
 *
 * `import.meta.url` is the real path while `process.argv[1]` keeps the spelling
 * the caller used, so a symlinked invocation is resolved on the argv side
 * before the comparison; the shell calls this file through `$ROOT`.
 * @returns true when the module is the entry point.
 */
function isEntryPoint() {
  if (process.argv[1] === undefined) return false
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href
  }
}

if (isEntryPoint()) {
  process.exitCode = runQualifiesCommand(process.argv.slice(2))
}
