/**
 * Pure helpers for the Node bootstrap and tests.
 *
 * The shell mirrors the same baseline, asset and candidate rules; its
 * --print-asset and --print-candidate-paths modes expose those values so the
 * suite can compare the shipped shell behaviour with this module. Nothing here
 * downloads, spawns a process or reads the environment.
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseVersion, satisfies } from './node-version.mjs'

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
 * Select the highest host candidate that satisfies the declared runtime.
 * @param candidates - `{ version, path }` entries.
 * @param requirements - `{ primaryMajor, range }`.
 * @returns the selected candidate, or undefined.
 */
export function selectNodeCandidate(candidates, requirements) {
  const valid = []
  for (const candidate of candidates) {
    try {
      const parsed = parseVersion(candidate.version)
      if (parsed.major !== requirements.primaryMajor) continue
      if (!satisfies(parsed, requirements.range)) continue
      valid.push({ candidate, parsed })
    } catch {
      // A malformed version is not a candidate.
    }
  }
  valid.sort((left, right) => {
    for (const key of ['major', 'minor', 'patch']) {
      if (left.parsed[key] !== right.parsed[key]) return right.parsed[key] - left.parsed[key]
    }
    return 0
  })
  return valid[0]?.candidate
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
