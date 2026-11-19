/**
 * Record a failed profile initialization.
 *
 * The failure message is bounded, so the untouched output is written next to
 * the other run artifacts first. A write failure never replaces the original
 * diagnosis: the message then names no file and the caller still sees why the
 * profile would not boot.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { profileInitFailure } from './process.mjs'

/**
 * Write the untouched output and build the failure message.
 * @param options - profile name, mode, captured result and the artifact directory.
 * @returns the failure message.
 */
export function recordProfileInitFailure({ profile, mode, init, artifactsDir }) {
  const output = init.stderr === '' ? init.stdout : init.stderr
  const logPath = join(artifactsDir, `init-${mode}.log`)
  try {
    writeFileSync(logPath, output)
  } catch {
    return profileInitFailure(profile, output)
  }
  return profileInitFailure(profile, output, logPath)
}
