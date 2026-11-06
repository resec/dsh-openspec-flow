#!/usr/bin/env node
/**
 * Remove the private evaluation homes left behind by a crashed matrix.
 *
 * Only marked roots are removed; an unmarked directory is reported and kept.
 */

import { cleanupStaleHomes } from './lib/dsh-home.mjs'

try {
  const removed = cleanupStaleHomes()
  console.log(`removed ${removed.length} private evaluation home(s)`)
  for (const path of removed) console.log(`- ${path}`)
} catch (error) {
  console.error(`eval:clean: ${error.message}`)
  process.exit(1)
}
