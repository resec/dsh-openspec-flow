/**
 * Run the OpenSpec CLI bundled with this plugin.
 *
 * The executable is resolved from the plugin's own `@fission-ai/openspec`
 * dependency. There is no PATH, project-local, or configured override: the
 * plugin is built against one CLI version and verifies that version once per
 * process before running any command. The CLI stays the authority for schema
 * resolution, roots, stores and state; this module only executes it and parses
 * its JSON.
 *
 * @module dsh-openspec-flow/openspec
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

/** Largest stdout collected from the CLI; `instructions apply` is ~14 KB today. */
const MAX_STDOUT_BYTES = 4 * 1024 * 1024
/** Largest stderr collected for diagnostics. */
const MAX_STDERR_BYTES = 512 * 1024
/** Grace period for a terminated CLI process. */
const GRACE_MS = 5_000

/** Plugin manifest, used to read the exact CLI pin. */
const PLUGIN_MANIFEST_PATH = fileURLToPath(new URL('../package.json', import.meta.url))

/**
 * Read the exact `@fission-ai/openspec` version this plugin pins.
 * @returns the declared dependency value.
 */
function readPinnedVersion() {
  const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST_PATH, 'utf8'))
  const value = manifest.dependencies?.['@fission-ai/openspec']
  return typeof value === 'string' ? value : ''
}

/**
 * The exact OpenSpec CLI version this plugin is built against.
 *
 * The value comes from this package's `dependencies`; an empty string or a
 * range means the plugin was packaged incorrectly and the gate fails closed.
 */
export const PINNED_CLI_VERSION = readPinnedVersion()

/**
 * Whether a path is a regular file (following symlinks).
 * @param file - candidate path.
 * @returns true when it exists and is a file.
 */
function isFile(file) {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}

/**
 * Walk up from a package entry to the package root.
 *
 * The OpenSpec package does not export `package.json`, so the root cannot be
 * resolved directly. Walking up and checking the package name avoids assuming
 * the current `dist/index.js` entry layout.
 *
 * @param entry - resolved package entry.
 * @returns the package root and parsed manifest.
 * @throws Error when no matching package root is found.
 */
function findPackageRoot(entry) {
  let current = dirname(entry)
  for (;;) {
    const manifestPath = join(current, 'package.json')
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        if (manifest.name === '@fission-ai/openspec') return { root: current, manifest }
      } catch {
        // Keep walking: a malformed manifest is not the package we need.
      }
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  throw new Error(
    'dsh-openspec-flow could not find the @fission-ai/openspec package root '
    + `from '${entry}'. Reinstall the plugin so its runtime dependency is intact.`,
  )
}

let cachedCli

/**
 * Resolve the single OpenSpec executable this plugin is allowed to run.
 *
 * Resolution is anchored at this module, not at the session directory, so a
 * project-local CLI or a PATH entry can never become the executable.
 *
 * @returns absolute path to `bin/openspec.js`.
 * @throws Error when the dependency is missing or has no usable bin.
 */
export function resolveBundledCli() {
  if (cachedCli !== undefined) return cachedCli
  let entry
  try {
    entry = require.resolve('@fission-ai/openspec')
  } catch (error) {
    const detail = error instanceof Error ? ` (${error.message})` : ''
    throw new Error(
      'dsh-openspec-flow could not resolve its bundled @fission-ai/openspec CLI. '
      + `Reinstall the plugin so its runtime dependencies are installed.${detail}`,
    )
  }
  const { root, manifest } = findPackageRoot(entry)
  const binField = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.openspec
  if (typeof binField !== 'string' || binField === '') {
    throw new Error(
      `The bundled @fission-ai/openspec package at '${root}' has no bin.openspec entry. `
      + 'Reinstall the plugin.',
    )
  }
  const bin = resolve(root, binField)
  if (!isFile(bin)) {
    throw new Error(
      `The bundled @fission-ai/openspec package points at a missing bin '${bin}'. `
      + 'Reinstall the plugin.',
    )
  }
  cachedCli = bin
  return bin
}

/**
 * Check a `version --json` report against the plugin's pin.
 * @param report - parsed report.
 * @returns nothing when the report is the pinned CLI with the expected envelope.
 * @throws Error naming the mismatch.
 */
export function assertCliVersion(report) {
  if (!/^\d+\.\d+\.\d+$/.test(PINNED_CLI_VERSION)) {
    throw new Error(
      `dsh-openspec-flow must pin @fission-ai/openspec to an exact version; `
      + `package.json declares '${PINNED_CLI_VERSION || '(missing)'}'. Reinstall or rebuild the plugin.`,
    )
  }
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('The bundled OpenSpec CLI returned a non-object version report.')
  }
  if (report.schemaVersion !== 1) {
    throw new Error(
      `The bundled OpenSpec CLI reports schemaVersion '${String(report.schemaVersion)}', `
      + 'but dsh-openspec-flow expects 1. Reinstall the plugin with its pinned CLI.',
    )
  }
  if (report.version !== PINNED_CLI_VERSION) {
    throw new Error(
      `The bundled OpenSpec CLI reports version '${String(report.version)}', `
      + `but dsh-openspec-flow pins '${PINNED_CLI_VERSION}'. `
      + 'Reinstall the plugin so its runtime dependency matches.',
    )
  }
}

/** @type {Promise<void> | undefined} */
let verification

/**
 * Verify the bundled CLI's version once per process.
 * @param ctx - host context.
 * @param cli - bundled executable.
 * @param settings - plugin settings.
 * @param cwd - working directory for the version call.
 * @param signal - cancellation.
 * @returns nothing when the CLI matches the pin.
 */
async function verifyBundledCli(ctx, cli, settings, cwd, signal) {
  if (verification !== undefined) {
    await verification
    return
  }
  verification = (async () => {
    const argv = [process.execPath, cli, 'version', '--json']
    const result = await spawnCapture(ctx, argv, cwd, signal, settings.timeoutMs)
    const report = parseJson(result.stdout)
    if (report === undefined) {
      const detail = result.stderr.trim() !== '' ? result.stderr : result.stdout
      throw new Error(
        `The bundled OpenSpec CLI returned no JSON version report (exit ${result.exitCode}): `
        + `${detail.trim().slice(0, 500) || '(no output)'}`,
      )
    }
    assertCliVersion(report)
  })()
  try {
    await verification
  } catch (error) {
    verification = undefined
    throw error
  }
}

/**
 * Drop the cached version verification.
 * Tests use it to exercise the first-call path; production keeps the cache for
 * the life of the process.
 * @returns nothing.
 */
export function clearCliVerification() {
  verification = undefined
}

/**
 * Append `--store <id>` when a store was selected.
 * @param args - argv after the executable.
 * @param store - store id, if any.
 * @returns a new argv.
 */
export function withStore(args, store) {
  const trimmed = typeof store === 'string' ? store.trim() : ''
  return trimmed === '' ? args : [...args, '--store', trimmed]
}

/**
 * Spawn the CLI and collect its output.
 * @param ctx - host context.
 * @param argv - executable and arguments.
 * @param cwd - working directory.
 * @param signal - caller cancellation.
 * @param timeoutMs - wall-clock limit.
 * @returns exit code, signal, stdout and stderr.
 */
async function spawnCapture(ctx, argv, cwd, signal, timeoutMs) {
  const timeout = Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000
  const controller = new AbortController()
  const timer = setTimeout(() => {
    const error = new Error(`OpenSpec CLI timed out after ${timeout} ms`)
    error.name = 'TimeoutError'
    controller.abort(error)
  }, timeout)
  const forwardAbort = () => {
    controller.abort(signal?.reason)
  }
  if (signal !== undefined) {
    if (signal.aborted) forwardAbort()
    else signal.addEventListener('abort', forwardAbort, { once: true })
  }
  try {
    const handle = ctx.subprocess.spawn({
      argv,
      cwd,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: MAX_STDOUT_BYTES },
        stderr: { maxBytes: MAX_STDERR_BYTES },
      },
      graceMs: GRACE_MS,
      signal: controller.signal,
      env: {
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        CI: '1',
      },
    })
    let outcome
    try {
      outcome = await handle.done
    } catch (error) {
      if (controller.signal.aborted) {
        const reason = controller.signal.reason
        throw reason instanceof Error ? reason : new Error(String(reason))
      }
      throw error
    }
    if (controller.signal.aborted) {
      const reason = controller.signal.reason
      throw reason instanceof Error ? reason : new Error('OpenSpec CLI was aborted.')
    }
    const stdout = handle.collected.stdout?.readFrom(0)
    const stderr = handle.collected.stderr?.readFrom(0)
    return {
      exitCode: outcome.exitCode,
      signal: outcome.signal,
      stdout: stdout?.text ?? '',
      stderr: stderr?.text ?? '',
      lossy: Boolean(stdout?.lossy || stderr?.lossy),
    }
  } finally {
    clearTimeout(timer)
    if (signal !== undefined) signal.removeEventListener('abort', forwardAbort)
  }
}

/**
 * Parse JSON from a command's stdout.
 * @param text - raw stdout.
 * @returns the parsed value, or undefined.
 */
export function parseJson(text) {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

/**
 * Shorten CLI output for an error message.
 * @param text - raw output.
 * @param limit - maximum characters.
 * @returns a trimmed, bounded excerpt.
 */
function excerpt(text, limit = 1_200) {
  const trimmed = text.trim()
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed
}

/**
 * Build the failure reason for a CLI call that produced no parseable JSON.
 * @param args - argv after the executable.
 * @param result - captured process result.
 * @returns an Error with exit code and available output.
 */
function cliFailure(args, result) {
  const detail = result.stderr.trim() !== '' ? result.stderr : result.stdout
  const suffix = result.lossy ? ' (output was truncated)' : ''
  return new Error(
    `openspec ${args.join(' ')} exited with code ${result.exitCode}${suffix}: ${excerpt(detail) || '(no output)'}`,
  )
}

/**
 * Run the CLI and parse its JSON.
 *
 * A non-zero exit is not itself an error: `openspec validate` exits 1 for an
 * invalid item and `openspec list` exits 1 with `root: null`, and both carry the
 * JSON the tools need. Only a call with no parseable JSON throws.
 *
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - argv after the executable; include `--json`.
 * @param signal - cancellation.
 * @returns `{ json, exitCode, stdout, stderr, argv }`.
 */
export async function runOpenSpec(ctx, settings, cwd, args, signal) {
  const executable = resolveBundledCli()
  await verifyBundledCli(ctx, executable, settings, cwd, signal)
  const argv = [process.execPath, executable, ...args]
  const result = await spawnCapture(ctx, argv, cwd, signal, settings.timeoutMs)
  const json = parseJson(result.stdout)
  if (json === undefined) {
    if (result.exitCode !== 0) throw cliFailure(args, result)
    throw new Error(
      `openspec ${args.join(' ')} returned no JSON: ${excerpt(result.stdout) || '(empty stdout)'}`,
    )
  }
  return { ...result, json, argv }
}

/**
 * Turn the CLI's `status` array into one Error.
 * @param status - `[{ severity, code, message, fix }]`.
 * @returns an Error whose message joins each item's message and fix.
 */
export function errorFromStatus(status) {
  const messages = []
  if (Array.isArray(status)) {
    for (const item of status) {
      if (item === null || typeof item !== 'object') continue
      const text = [item.message, item.fix]
        .filter((value) => typeof value === 'string' && value !== '')
        .join(' ')
      if (text !== '') messages.push(text)
    }
  }
  return new Error(messages.length > 0 ? messages.join('\n') : 'OpenSpec reported an error.')
}

/**
 * Throw when a payload is only a CLI error report.
 * @param json - parsed payload.
 * @param expected - fields that prove the payload is the expected success shape.
 * @returns nothing.
 */
export function throwIfOnlyStatus(json, expected) {
  if (json === null || typeof json !== 'object') return
  if (Array.isArray(json.status) && json.status.length > 0) {
    const hasExpected = expected.some((key) => json[key] !== undefined)
    if (!hasExpected) throw errorFromStatus(json.status)
  }
}
