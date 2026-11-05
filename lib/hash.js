/**
 * Content fingerprints used to notice a tracking file changed outside the tools.
 * @module dsh-openspec-flow/hash
 */

import { createHash } from 'node:crypto'

/**
 * SHA-1 of a file's UTF-8 text.
 * @param text - file content.
 * @returns a hex digest.
 */
export function hashText(text) {
  return createHash('sha1').update(text, 'utf8').digest('hex')
}
