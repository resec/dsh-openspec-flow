/**
 * Draft review object: the change artifacts plus the intent.
 *
 * A draft review is not a git commit. Its object hash is a sorted list of
 * artifact paths and SHA-256 digests, plus the intent text. This keeps draft
 * review usable in a project without git and makes every artifact edit
 * invalidate the review immediately.
 *
 * @module dsh-openspec-flow/review/object
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { sha256 } from './store.js'

/** Files every draft review requires. */
const REQUIRED_FILES = ['proposal.md', 'tasks.md', '.openspec.yaml']

/**
 * Convert a native relative path to POSIX form.
 * @param path - native path.
 * @returns POSIX path.
 */
function posix(path) {
  return sep === '/' ? path : path.split(sep).join('/')
}

/**
 * Collect Markdown files under a directory recursively.
 * @param directory - absolute directory.
 * @param base - change root for relative names.
 * @returns sorted relative paths.
 */
function markdownFiles(directory, base) {
  if (!existsSync(directory)) return []
  const out = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      out.push(...markdownFiles(full, base))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(posix(relative(base, full)))
    }
  }
  return out.sort()
}

/**
 * List every draft artifact path.
 * @param changeRoot - absolute change directory.
 * @returns sorted relative paths.
 * @throws when a required artifact is missing.
 */
export function draftArtifactPaths(changeRoot) {
  const paths = []
  for (const name of REQUIRED_FILES) {
    if (!existsSync(join(changeRoot, name))) {
      throw new Error(`draft review needs ${name} in ${changeRoot}`)
    }
    paths.push(name)
  }
  const specs = markdownFiles(join(changeRoot, 'specs'), changeRoot)
  if (specs.length === 0) throw new Error(`draft review needs at least one spec under ${join(changeRoot, 'specs')}`)
  paths.push(...specs)
  if (existsSync(join(changeRoot, 'design.md'))) paths.push('design.md')
  return [...new Set(paths)].sort()
}

/**
 * Normalize artifact text for hashing.
 *
 * Task checkbox state changes while apply is running, so the draft plan hash
 * ignores only the checkbox marker in `tasks.md`.
 * @param path - relative artifact path.
 * @param text - file text.
 * @returns normalized text.
 */
function normalizeArtifact(path, text) {
  if (path !== 'tasks.md') return text
  return text.replace(/^(\s*[-*]\s*\[)[ xX](\])/gmu, '$1 $2')
}

/**
 * Read the draft artifacts and compute their individual and combined hashes.
 * @param changeRoot - absolute change directory.
 * @returns `{ files, hash }` where `hash` covers only the artifacts.
 */
export function collectDraftArtifacts(changeRoot) {
  const files = draftArtifactPaths(changeRoot).map((path) => {
    const bytes = readFileSync(join(changeRoot, path))
    return { path, sha256: sha256(normalizeArtifact(path, bytes.toString('utf8'))) }
  })
  return { files, hash: hashFiles(files) }
}

/**
 * Hash a file list.
 * @param files - `{ path, sha256 }` entries.
 * @returns SHA-256 of the sorted lines.
 */
export function hashFiles(files) {
  const lines = [...files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => `${file.path}\0${file.sha256}`)
  return sha256(lines.join('\n'))
}

/**
 * Combine the artifact hash with the intent hash.
 * @param artifactHash - hash of the artifacts.
 * @param intent - user goal and acceptance conditions.
 * @returns the draft object hash.
 */
export function draftObjectHash(artifactHash, intent) {
  return sha256(`artifacts\0${artifactHash}\nintent\0${sha256(intent)}`)
}

/**
 * Compute a draft object from a change directory and intent.
 * @param changeRoot - absolute change directory.
 * @param intent - user goal and acceptance conditions.
 * @returns `{ files, artifactHash, objectHash, intentHash }`.
 */
export function draftObject(changeRoot, intent) {
  const artifacts = collectDraftArtifacts(changeRoot)
  return {
    files: artifacts.files,
    artifactHash: artifacts.hash,
    objectHash: draftObjectHash(artifacts.hash, intent),
    intentHash: sha256(intent),
  }
}

/**
 * Compare the artifact files recorded by a draft review with the current ones.
 * @param before - `{ path, sha256 }` entries recorded at the draft review.
 * @param after - current `{ path, sha256 }` entries.
 * @returns `[{ path, status }]` sorted by path; status is modified, added or removed.
 */
export function diffArtifactFiles(before, after) {
  const previous = new Map((before ?? []).map((file) => [file.path, file.sha256]))
  const current = new Map((after ?? []).map((file) => [file.path, file.sha256]))
  const paths = [...new Set([...previous.keys(), ...current.keys()])].sort()
  const changes = []
  for (const path of paths) {
    const was = previous.get(path)
    const is = current.get(path)
    if (was === undefined) changes.push({ path, status: 'added' })
    else if (is === undefined) changes.push({ path, status: 'removed' })
    else if (was !== is) changes.push({ path, status: 'modified' })
  }
  return changes
}
