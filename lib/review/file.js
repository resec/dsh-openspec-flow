/**
 * The project review configuration file.
 *
 * `openspec/reviews.json` is the source of review parameters: named profiles
 * that declare a review object type, and the draft and apply entries that name
 * one profile each. The reader is pure: it reads, parses, validates and returns
 * the resolved document plus the source facts a locked policy records. It keeps
 * no cache, so a change created after an edit sees the current file.
 *
 * @module dsh-openspec-flow/review/file
 */

import { readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DEFAULT_REVIEW_CONFIG, normalizeReviewDocument } from './config.js'
import { sha256 } from './store.js'

/** Directory name that holds the review configuration. */
export const REVIEW_CONFIG_DIR = 'openspec'

/** File name of the review configuration. */
export const REVIEW_CONFIG_FILE = 'reviews.json'

/** Reported when a row config still carries the removed `reviews` section. */
export const LEGACY_REVIEWS_NOTICE = 'the plugin row config carries a reviews section; it is ignored. Move the review parameters to openspec/reviews.json.'

/**
 * The default review configuration path for a project.
 * @param projectRoot - resolved project root.
 * @returns the absolute path.
 */
export function reviewConfigPath(projectRoot) {
  return join(projectRoot, REVIEW_CONFIG_DIR, REVIEW_CONFIG_FILE)
}

/**
 * Render the default document `openspec_init` writes.
 * @returns the file text.
 */
export function defaultReviewConfigText() {
  return `${JSON.stringify(DEFAULT_REVIEW_CONFIG, null, 2)}\n`
}

/**
 * A path as recorded in a policy source: relative to the project root when the
 * file is inside it, absolute otherwise, always with POSIX separators.
 * @param projectRoot - resolved project root.
 * @param file - absolute file path.
 * @returns the recorded path.
 */
export function recordedConfigPath(projectRoot, file) {
  const inside = relative(projectRoot, file)
  if (inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)) {
    return inside.split(sep).join('/')
  }
  return file
}

/**
 * Failures carry the path and the field, so a caller can act on them.
 * @param file - absolute file path.
 * @param issues - collected messages.
 * @returns the failure result.
 */
function failure(file, issues) {
  return { ok: false, issues: issues.map((issue) => ({ ...issue, path: file })) }
}

/**
 * Read and validate the project review configuration.
 *
 * The document is required: a missing, unreadable, unparsable or invalid file
 * fails the call. There is no built-in fallback because the only intended
 * default is the file `openspec_init` writes.
 * @param projectRoot - resolved project root.
 * @param options - optional `configPath` naming another file.
 * @returns `{ ok: true, value, source }` or `{ ok: false, issues }`.
 */
export function readReviewConfig(projectRoot, options = {}) {
  const supplied = typeof options?.configPath === 'string' && options.configPath.trim() !== ''
    ? options.configPath.trim()
    : undefined
  const file = supplied === undefined
    ? reviewConfigPath(projectRoot)
    : isAbsolute(supplied) ? supplied : resolve(projectRoot, supplied)
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    const code = error?.code
    if (code === 'ENOENT') {
      return failure(file, [{ message: `review configuration not found at ${file}; run openspec_init or add the file` }])
    }
    return failure(file, [{ message: `cannot read ${file}: ${String(error?.message ?? error)}` }])
  }
  let json
  try {
    json = JSON.parse(text)
  } catch (error) {
    return failure(file, [{ message: `${file} is not valid JSON: ${String(error?.message ?? error)}` }])
  }
  const normalized = normalizeReviewDocument(json)
  if (normalized.value === undefined) {
    return failure(file, normalized.issues.map((issue) => ({ message: `${file}: ${issue.message}` })))
  }
  return {
    ok: true,
    value: normalized.value,
    source: {
      path: recordedConfigPath(projectRoot, file),
      sha256: sha256(text),
      profiles: {
        draft: normalized.value.reviews.draft,
        apply: normalized.value.reviews.apply,
      },
    },
  }
}
