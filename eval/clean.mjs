#!/usr/bin/env node
/**
 * Remove the private evaluation homes left behind by a crashed matrix.
 *
 * Only marked roots are removed; an unmarked directory is reported and kept.
 */

import {
  cleanupEvalHome,
  DEFAULT_AGENTS_HOME,
  DEFAULT_DSH_HOME,
} from './lib/dsh-home.mjs'

try {
  cleanupEvalHome()
  console.log(`removed ${DEFAULT_DSH_HOME} and ${DEFAULT_AGENTS_HOME} when present`)
} catch (error) {
  console.error(`eval:clean: ${error.message}`)
  process.exit(1)
}
