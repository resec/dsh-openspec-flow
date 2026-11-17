#!/usr/bin/env node
/**
 * Installed-package probe for the review-card channel.
 *
 * The probe imports the plugin's and the Host's `@deepseek-ai/dsh-session`,
 * compares the resolved module files, creates a Session through the Host copy,
 * writes a review-card record through the plugin copy, and asserts that the
 * record is absent from the model-visible surface. It runs after a real
 * profile install; a different module copy makes the write fail, which is the
 * condition the release gate must catch.
 *
 * Usage:
 *   node scripts/probe-session.mjs --plugin <installed-plugin-dir> --host <dsh-root>
 *
 * `--host` may be the DSH install root (containing
 * `node_modules/@deepseek-ai/dsh-session`) or the package directory itself.
 */

import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The record type the probe writes. */
const CARD_EVENT = 'plugin:openspec-flow/review-card'

/**
 * Read one required option.
 * @param argv - process arguments.
 * @param name - option name.
 * @returns the value, or undefined.
 */
function option(argv, name) {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

/**
 * Resolve one installed package directory.
 * @param base - install root or package directory.
 * @param packageName - scoped package name.
 * @returns the package directory.
 */
function packageDirectory(base, packageName) {
  const direct = resolve(base)
  try {
    const manifest = JSON.parse(readFileSync(join(direct, 'package.json'), 'utf8'))
    if (manifest.name === packageName) return direct
  } catch {
    // Fall through to the node_modules layout.
  }
  const scoped = join(direct, 'node_modules', packageName)
  JSON.parse(readFileSync(join(scoped, 'package.json'), 'utf8'))
  return scoped
}

/**
 * Resolve the plugin's installed copy.
 * @param pluginRoot - installed plugin directory.
 * @returns the package directory.
 */
function pluginPackageDirectory(pluginRoot) {
  const require = createRequire(join(resolve(pluginRoot), 'package.json'))
  const manifest = require.resolve('@deepseek-ai/dsh-session/package.json')
  return resolve(manifest, '..')
}

/**
 * Fail the probe with a correction-oriented message.
 * @param message - failure reason.
 * @returns never.
 */
function fail(message) {
  console.error(`probe-session: ${message}`)
  process.exitCode = 1
}

/**
 * Run the probe.
 * @returns nothing.
 */
async function main() {
  const pluginRoot = option(process.argv, '--plugin')
  const hostRoot = option(process.argv, '--host')
  if (pluginRoot === undefined || hostRoot === undefined) {
    console.error('usage: node scripts/probe-session.mjs --plugin <installed-plugin-dir> --host <dsh-root>')
    process.exitCode = 2
    return
  }

  const plugin = JSON.parse(readFileSync(join(resolve(pluginRoot), 'package.json'), 'utf8'))
  const declared = plugin.dependencies?.['@deepseek-ai/dsh-session']
  if (typeof declared !== 'string' || declared === '') {
    fail('the installed plugin declares no @deepseek-ai/dsh-session dependency; reinstall the current tarball')
    return
  }
  const engine = typeof plugin.engines?.dsh === 'string' ? plugin.engines.dsh.replace(/^=/, '') : undefined
  if (declared !== engine) {
    fail(`@deepseek-ai/dsh-session ${declared} does not match engines.dsh ${String(plugin.engines?.dsh)}`)
    return
  }

  const hostDirectory = packageDirectory(hostRoot, '@deepseek-ai/dsh-session')
  const pluginDirectory = pluginPackageDirectory(pluginRoot)
  const hostReal = realpathSync(hostDirectory)
  const pluginReal = realpathSync(pluginDirectory)
  const hostModule = await import(pathToFileURL(join(hostReal, 'lib', 'index.js')).href)
  const pluginModule = await import(pathToFileURL(join(pluginReal, 'lib', 'index.js')).href)

  const hostVersion = JSON.parse(readFileSync(join(hostReal, 'package.json'), 'utf8')).version
  if (hostVersion !== declared) {
    fail(`Host session package ${hostVersion} does not match the plugin dependency ${declared}`)
    return
  }

  const session = hostModule.Session.create('probe-session', [], {
    version: hostModule.SESSION_FORMAT_VERSION,
    id: 'probe-session',
    createdAt: Date.now(),
    isSeeded: false,
  })
  const before = session.log.length
  try {
    pluginModule.appendPluginRecord(session, CARD_EVENT, {
      phase: 'review',
      change: 'probe',
      review: 'draft',
      round: 1,
      findings: [],
    })
  } catch (error) {
    const copies = hostReal === pluginReal ? 'the module paths match' : `host ${hostReal} vs plugin ${pluginReal}`
    fail(`the plugin cannot write through the Host Session (${copies}): ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  if (session.log.length !== before + 1) {
    fail('the probe record did not append exactly one event')
    return
  }
  const record = session.log.at(-1)
  if (record.type !== CARD_EVENT || record.ignorable !== true) {
    fail('the appended event is not an ignorable review-card record')
    return
  }
  if (session.surface.nodes.includes(record.seq)) {
    fail('the probe record entered the model-visible surface')
    return
  }

  console.log(`probe-session: ok (${hostVersion}, modules ${hostReal === pluginReal ? 'shared' : 'distinct copies, write succeeded'})`)
}

await main()
