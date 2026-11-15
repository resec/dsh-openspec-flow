#!/usr/bin/env node
/**
 * Pack the plugin into an installable npm tarball under `dist/`.
 *
 * The orchestration lives in `lib/pack.js`; this entrypoint only resolves the
 * repository root, forwards the arguments and prints the result. Installing
 * the tarball stays a user action in the Plugins page; the script never
 * writes the profile.
 */

import { fileURLToPath } from 'node:url'
import { runPack } from '../lib/pack.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const { code, lines } = runPack({ root: ROOT, argv: process.argv.slice(2) })

for (const { text, error } of lines) {
  if (error) console.error(text)
  else console.log(text)
}
process.exitCode = code
