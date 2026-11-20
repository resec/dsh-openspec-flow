/**
 * Packaging primitives for the local bundle tarball.
 *
 * The module is pure over its inputs: it reads the package manifest, the
 * repository layout and a tarball's bytes. The entrypoint in
 * `scripts/bundle-pack.mjs` owns the process-level work (git status, npm pack,
 * publishing into `dist/`). Keeping the gates here makes each one testable
 * without a live profile or a package manager.
 *
 * @module dsh-openspec-flow/bundle
 */

import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { splitDirtyPaths, statusLinePaths } from './status-paths.js'

export { splitDirtyPaths }

/** Directory that holds the published artifact pair. */
export const DIST_DIR = 'dist'

/** Scratch directory used while a pack is verified; ignored through `.cache/`. */
export const SCRATCH_DIR = '.cache/pack'

/** Paths a tarball must never carry. */
export const FORBIDDEN_PREFIXES = ['test/', 'openspec/', 'scripts/', 'node_modules/', 'dist/']

/** Entrypoints every artifact must carry, whatever the manifest's `files` says. */
export const REQUIRED_ENTRYPOINTS = ['index.js', 'client.js', 'reviewer.js', 'cordis.patch.yml', 'icon.svg']

/** A packaging gate rejected the input. */
export class BundleError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BundleError'
  }
}

/**
 * Read the package manifest from the repository root.
 * @param root - absolute repository root.
 * @returns the parsed manifest.
 * @throws {BundleError} when the manifest is unreadable.
 */
export function readManifest(root) {
  let text
  try {
    text = readFileSync(join(root, 'package.json'), 'utf8')
  } catch (error) {
    throw new BundleError(`cannot read package.json: ${error.message}`)
  }
  return JSON.parse(text)
}

/**
 * List the files under one directory, recursively.
 * @param root - absolute repository root.
 * @param directory - POSIX path relative to the root.
 * @returns the file paths, relative to the root.
 * @throws {BundleError} when the directory is missing.
 */
function walk(root, directory) {
  const absolute = join(root, directory)
  if (!existsSync(absolute)) throw new BundleError(`the published directory ${directory}/ is missing`)
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`
    return entry.isDirectory() ? walk(root, relative) : [relative]
  })
}

/**
 * Paths the manifest's `exports` map names as plain files.
 * @param manifest - the package manifest.
 * @returns the paths without a leading `./`, wildcard entries excluded.
 */
function exportPaths(manifest) {
  const paths = []
  for (const value of Object.values(manifest.exports ?? {})) {
    if (typeof value === 'string' && value.startsWith('./') && !value.includes('*')) {
      paths.push(value.slice(2))
    }
  }
  return paths
}

/**
 * The unconditional core set: paths every artifact must carry regardless of
 * the manifest's `files` list. It is independent of that list so a manifest
 * that drops an entrypoint cannot also drop the requirement for it.
 * @param root - absolute repository root.
 * @param manifest - the package manifest.
 * @returns sorted POSIX paths.
 */
export function corePaths(root, manifest) {
  const paths = new Set(['package.json', ...REQUIRED_ENTRYPOINTS])
  if (typeof manifest.main === 'string') paths.add(manifest.main)
  for (const path of exportPaths(manifest)) paths.add(path)
  for (const path of walk(root, 'lib')) paths.add(path)
  for (const path of walk(root, 'skills')) paths.add(path)
  for (const entry of readdirSync(join(root, 'locale'))) {
    if (entry.endsWith('.json')) paths.add(`locale/${entry}`)
  }
  return [...paths].sort()
}

/**
 * Paths the tarball must carry: the core set plus the manifest's `files`
 * expansion. A file entry is required as written, `name/**` expands to the
 * files under that directory, and a wildcard entry such as `locale/*.json`
 * expands by its suffix. Documentation entries are not required.
 * @param root - absolute repository root.
 * @param manifest - the package manifest; read from the root when omitted.
 * @returns sorted POSIX paths.
 */
export function expectedPublishedPaths(root, manifest = readManifest(root)) {
  const paths = new Set(corePaths(root, manifest))
  for (const entry of manifest.files ?? []) {
    if (entry === 'README.md' || entry === 'LICENSE') continue
    if (entry.endsWith('/**')) {
      for (const path of walk(root, entry.slice(0, -3))) paths.add(path)
    } else if (entry.includes('*')) {
      const slash = entry.lastIndexOf('/')
      const suffix = entry.slice(entry.lastIndexOf('*') + 1)
      for (const path of walk(root, entry.slice(0, slash))) {
        if (path.endsWith(suffix)) paths.add(path)
      }
    } else {
      paths.add(entry)
    }
  }
  return [...paths].sort()
}

/**
 * Parse the paths out of a gzipped npm tarball.
 * @param gzipped - the tarball's bytes.
 * @returns the paths in archive order, without npm's `package/` prefix.
 * @throws {BundleError} when the archive cannot be read or is truncated.
 */
export function tarballPaths(gzipped) {
  let data
  try {
    data = gunzipSync(gzipped)
  } catch (error) {
    throw new BundleError(`cannot read the tarball: ${error.message}`)
  }
  const paths = []
  let at = 0
  let zeroBlocks = 0
  while (at + 512 <= data.length) {
    const name = data.toString('utf8', at, at + 100).replace(/\0[\s\S]*$/u, '')
    if (name === '') {
      zeroBlocks += 1
      at += 512
      continue
    }
    zeroBlocks = 0
    const size = Number.parseInt(data.toString('utf8', at + 124, at + 136).replace(/\0[\s\S]*$/u, '').trim(), 8) || 0
    const type = String.fromCharCode(data[at + 156])
    const body = at + 512
    if ((type === '0' || type === '\0') && name.startsWith('package/')) {
      paths.push(name.slice('package/'.length))
    }
    at = body + Math.ceil(size / 512) * 512
  }
  if (zeroBlocks < 2) throw new BundleError('the tarball is missing its end-of-archive marker')
  return paths
}

/**
 * Verify the tarball carries every required path and no forbidden one.
 * @param gzipped - the tarball's bytes.
 * @param expected - required POSIX paths.
 * @returns the tarball's paths.
 * @throws {BundleError} naming the missing or forbidden paths.
 */
export function verifyTarball(gzipped, expected) {
  const paths = tarballPaths(gzipped)
  const present = new Set(paths)
  const missing = expected.filter((path) => !present.has(path))
  const forbidden = paths.filter((path) => FORBIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix)))
  if (missing.length > 0 || forbidden.length > 0) {
    const parts = []
    if (missing.length > 0) parts.push(`missing: ${missing.join(', ')}`)
    if (forbidden.length > 0) parts.push(`forbidden: ${forbidden.join(', ')}`)
    throw new BundleError(`the tarball does not match the published set (${parts.join('; ')})`)
  }
  return paths
}

/**
 * SHA-512 of the tarball bytes.
 * @param bytes - the tarball's bytes.
 * @returns a hex digest.
 */
export function sha512Hex(bytes) {
  return createHash('sha512').update(bytes).digest('hex')
}

/**
 * Paths of one artifact pair.
 * @param distDir - absolute `dist` directory.
 * @param name - package name.
 * @param version - package version.
 * @returns the tarball and metadata paths.
 */
export function artifactPaths(distDir, name, version) {
  const base = `${name}-${version}`
  const directory = join(distDir, base)
  return {
    directory,
    tarball: join(directory, `${base}.tgz`),
    metadata: join(directory, `${base}.json`),
  }
}

/**
 * Refuse an existing artifact pair unless the caller forces the repack.
 * @param distDir - absolute `dist` directory.
 * @param name - package name.
 * @param version - package version.
 * @param force - whether the repack was requested.
 * @throws {BundleError} when a pair exists and `force` is false.
 */
export function assertFresh(distDir, name, version, force) {
  recoverArtifacts(distDir, name, version)
  if (force) return
  const { directory } = artifactPaths(distDir, name, version)
  if (existsSync(directory)) {
    throw new BundleError(`the artifact for ${name}@${version} already exists (${directory}); raise the version or pass --force`)
  }
}

/**
 * Recover from an interrupted publish: restore a version directory that was
 * moved aside, and remove staging directories left by an interrupted write.
 * @param distDir - absolute `dist` directory.
 * @param name - package name.
 * @param version - package version.
 */
export function recoverArtifacts(distDir, name, version) {
  if (!existsSync(distDir)) return
  const { directory } = artifactPaths(distDir, name, version)
  const base = `${name}-${version}`
  for (const entry of readdirSync(distDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(`${base}.`)) continue
    const path = join(distDir, entry.name)
    if (entry.name.startsWith(`${base}.staging-`)) {
      rmSync(path, { recursive: true, force: true })
    } else if (entry.name.startsWith(`${base}.previous-`)) {
      if (!existsSync(directory)) renameSync(path, directory)
      else rmSync(path, { recursive: true, force: true })
    }
  }
}

/**
 * Parse the paths of a dirty working tree, including both sides of a rename.
 * @param porcelain - `git status --porcelain` output.
 * @returns the dirty paths.
 */
export function dirtyPaths(porcelain) {
  return porcelain.split('\n').flatMap((line) => statusLinePaths(line))
}

/**
 * Build the metadata record for a verified tarball.
 * @param manifest - the package manifest.
 * @param gzipped - the tarball's bytes.
 * @param paths - the verified paths.
 * @param revision - the `HEAD` commit.
 * @param at - the packed-at timestamp.
 * @returns the metadata record.
 */
export function metadataFor(manifest, gzipped, paths, revision, at) {
  return {
    name: manifest.name,
    version: manifest.version,
    file: `${manifest.name}-${manifest.version}.tgz`,
    sha512: sha512Hex(gzipped),
    bytes: gzipped.length,
    files: paths.length,
    revision,
    dirty: false,
    at,
  }
}

/**
 * Verify the tarball, then publish the pair into `dist/`.
 *
 * The check runs before any write, so a rejected first pack leaves no file
 * behind and a rejected `--force` repack leaves the previous pair untouched.
 *
 * @param distDir - absolute `dist` directory.
 * @param manifest - the package manifest.
 * @param gzipped - the tarball's bytes.
 * @param expected - required POSIX paths.
 * @param revision - the `HEAD` commit.
 * @param at - the packed-at timestamp.
 * @returns the written metadata record.
 * @throws {BundleError} when the tarball fails verification.
 */
export function publishVerified(distDir, manifest, gzipped, expected, revision, at) {
  const paths = verifyTarball(gzipped, expected)
  const record = metadataFor(manifest, gzipped, paths, revision, at)
  mkdirSync(distDir, { recursive: true })
  const { directory } = artifactPaths(distDir, manifest.name, manifest.version)
  recoverArtifacts(distDir, manifest.name, manifest.version)
  const staging = `${directory}.staging-${randomUUID()}`
  const backup = `${directory}.previous-${randomUUID()}`
  let replacing = false
  try {
    mkdirSync(staging, { recursive: true })
    writeFileSync(join(staging, `${manifest.name}-${manifest.version}.tgz`), gzipped)
    writeFileSync(join(staging, `${manifest.name}-${manifest.version}.json`), `${JSON.stringify(record, null, 2)}\n`)
    replacing = existsSync(directory)
    if (replacing) renameSync(directory, backup)
    renameSync(staging, directory)
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    if (existsSync(backup) && !existsSync(directory)) renameSync(backup, directory)
    throw error
  }
  if (replacing) rmSync(backup, { recursive: true, force: true })
  return record
}
