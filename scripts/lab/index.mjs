/**
 * Public lab API: create an isolated DSH, drive it, inspect it and close it.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT } from './core/paths.mjs'
import { readPackage } from './core/paths.mjs'
import { createRun, finalizeRun } from './core/run-dir.mjs'
import { dshVersion, ensureDsh } from './core/cache.mjs'
import { installPlugin, packPlugin, writeMockPatch } from './core/install.mjs'
import { assertHostUnchanged, hostFingerprint } from './core/host-guard.mjs'
import { startLogged } from './core/process.mjs'
import { startMockProvider } from './mock/provider.mjs'
import { runHeadless } from './drivers/headless.mjs'
import { parseStartupUrl } from './drivers/http.mjs'
import {
  chooseWorkspace,
  dismissOnboarding,
  expectText,
  openPage,
  openSession,
  screenshot,
  send,
  waitForShell,
} from './drivers/web.mjs'
import { findSessionLog, readSessionEvents } from './inspect/sessions.mjs'

/** Supported scenario models. */
export const MODELS = ['mock', 'real']

/**
 * Define one reusable scenario.
 * @param spec - `{ name, model?, run }`.
 * @returns the normalized scenario.
 */
export function defineScenario(spec) {
  if (spec === null || typeof spec !== 'object') throw new Error('a scenario must be an object')
  if (typeof spec.name !== 'string' || spec.name === '') throw new Error('a scenario needs a name')
  if (typeof spec.run !== 'function') throw new Error(`scenario ${spec.name} needs a run function`)
  const model = spec.model ?? 'mock'
  if (!MODELS.includes(model)) throw new Error(`scenario ${spec.name} has unknown model ${String(model)}`)
  return { ...spec, model }
}

/**
 * Discover reusable scenarios under `test/lab/`.
 * @param options - repository root and optional directory.
 * @returns repository-relative scenario files.
 */
export function discoverScenarios({ root = ROOT, directory = 'test/lab' } = {}) {
  const base = resolve(root, directory)
  if (!existsSync(base)) return []
  const out = []
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) walk(child)
      else if (entry.name.endsWith('.scenario.mjs')) out.push(child)
    }
  }
  walk(base)
  return out.sort()
}

/**
 * Create one isolated lab.
 * @param options - plugin tarball, model, run flags and environment.
 * @returns the lab context.
 */
export async function createLab({
  pluginTarball,
  model = 'mock',
  keep = false,
  cleanup = false,
  offline = false,
  fresh = false,
  root = ROOT,
  env = process.env,
  headless = true,
} = {}) {
  if (!MODELS.includes(model)) throw new Error(`unknown lab model ${String(model)}`)
  const pkg = readPackage()
  const version = dshVersion(pkg)
  const run = createRun({ name: 'scenario', base: join(root, '.cache', 'lab', 'runs') })
  const before = hostFingerprint()
  const dsh = await ensureDsh({ version, offline, fresh, runDirectory: run.home, env })
  const mock = model === 'mock' ? await startMockProvider({ log: join(run.artifacts, 'mock.log') }) : undefined
  const labEnv = {
    ...env,
    DSH_HOME: run.home,
    DSH_AGENTS_HOME: run.agentsHome,
    LAB_MOCK_KEY: 'lab-mock-key',
    PLAYWRIGHT_BROWSERS_PATH: env.PLAYWRIGHT_BROWSERS_PATH ?? join(root, '.cache', 'lab', 'pw-browsers'),
    ...(existsSync(join(root, '.cache', 'lab', 'fontconfig', 'fonts.conf')) ? { FONTCONFIG_FILE: join(root, '.cache', 'lab', 'fontconfig', 'fonts.conf') } : {}),
  }
  const state = { web: undefined, profiles: {}, dumps: {}, closed: false }
  const output = { run, dsh, mock, env: labEnv, version, plugin: pluginTarball, results: [] }

  async function ensureProfile(mode) {
    const profile = `verify-${mode}`
    if (state.profiles[profile] !== undefined) return state.profiles[profile]
    const init = await import('./core/process.mjs').then(({ run: execute }) => execute(
      process.execPath,
      [dsh.bin, '--profile', profile, '--from-default-profile', mode, '--dump-config'],
      { timeoutMs: 120_000, env: labEnv, cwd: run.project },
    ))
    if (init.status !== 0) throw new Error(`could not initialize ${profile}: ${(init.stderr || init.stdout).slice(-1_500)}`)
    const installed = installPlugin({
      dshBin: dsh.bin,
      profile,
      tarball: pluginTarball.tarball,
      offline,
      env: labEnv,
      home: run.home,
    })
    if (model === 'mock') writeMockPatch(installed.profileDirectory, mock.url)
    state.profiles[profile] = installed
    state.dumps[profile] = installed.dump
    return installed
  }

  async function ensureWeb() {
    if (state.web !== undefined) return state.web
    await ensureProfile('web')
    const logPath = join(run.artifacts, 'web.log')
    const processHandle = startLogged(
      process.execPath,
      [dsh.bin, '--profile', 'verify-web', '--port', '0', '--no-open'],
      { cwd: run.project, env: labEnv, logPath },
    )
    const line = await processHandle.waitFor(/dsh web:/, 90_000)
    const url = parseStartupUrl(line)
    if (url === undefined) throw new Error('the web startup line carried no URL')
    const opened = await openPage({ url, headless, browsersPath: labEnv.PLAYWRIGHT_BROWSERS_PATH, fontConfig: labEnv.FONTCONFIG_FILE })
    await waitForShell(opened.page)
    const cookies = await opened.page.context().cookies()
    const cookie = cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ')
    const base = new URL(url).origin
    const web = {
      ...opened,
      url,
      base,
      cookie,
      logPath,
      process: processHandle,
      dismissOnboarding: () => dismissOnboarding(opened.page),
      chooseWorkspace: (directory) => chooseWorkspace(opened.page, directory),
      openSession: (text) => openSession(opened.page, text),
      send: (text) => send(opened.page, text),
      expectText: (text, timeout) => expectText(opened.page, text, timeout),
      screenshot: (path) => screenshot(opened.page, path),
      reload: () => opened.page.reload({ waitUntil: 'domcontentloaded' }),
      close: async () => {
        await opened.browser.close().catch(() => {})
        await processHandle.stop().catch(() => {})
      },
    }
    state.web = web
    return web
  }

  const headlessApi = {
    /**
     * Run one headless task.
     * @param options - cwd, prompt, timeout and optional session id.
     * @returns the headless result.
     */
    async run(options) {
      await ensureProfile('headless')
      return runHeadless({
        node: process.execPath,
        dshBin: dsh.bin,
        profile: 'verify-headless',
        env: labEnv,
        cwd: options.cwd ?? run.project,
        task: options.prompt ?? options.task ?? '',
        timeoutMs: options.timeoutMs,
        sessionId: options.sessionId,
        permissionMode: options.permissionMode,
        approvalPolicy: options.approvalPolicy,
      })
    },
  }

  const inspectApi = {
    /**
     * Read one session log.
     * @param sessionId - session id.
     * @returns parsed events.
     */
    sessions(sessionId) {
      const path = findSessionLog(run.home, sessionId)
      if (path === undefined) throw new Error(`no session log for ${sessionId}`)
      return readSessionEvents(path)
    },
    /**
     * Read card files from the run project.
     * @returns card file values.
     */
    cards() {
      const root = join(run.project, 'openspec', '.review')
      if (!existsSync(root)) return []
      const cards = []
      for (const entry of readdirSync(root)) {
        const directory = join(root, entry, 'cards')
        if (!existsSync(directory)) continue
        for (const file of readdirSync(directory)) {
          if (!file.endsWith('.json')) continue
          try {
            cards.push(JSON.parse(readFileSync(join(directory, file), 'utf8')))
          } catch {
            // A malformed card is a finding, not a crash.
          }
        }
      }
      return cards
    },
    /**
     * Read one profile's composed configuration.
     * @param mode - `headless` or `web`.
     * @returns the dump text.
     */
    dump(mode) {
      return state.dumps[`verify-${mode}`]
    },
  }

  const api = {
    ...output,
    headless: headlessApi,
    inspect: inspectApi,
    web: { open: ensureWeb },
    http: {
      async call(endpoint, payload = {}) {
        const web = await ensureWeb()
        const { callReviewEndpoint } = await import('./drivers/http.mjs')
        return callReviewEndpoint({ base: web.base, cookie: web.cookie, endpoint, payload })
      },
    },
    fixture: {
      /**
       * Create a minimal OpenSpec project in the run directory.
       * @param options - change name.
       * @returns the project directory.
       */
      openSpecChange({ change = 'demo' } = {}) {
        const directory = join(run.project, 'openspec', 'changes', change)
        mkdirSync(directory, { recursive: true })
        writeFileSync(join(run.project, 'README.md'), '# lab project\n')
        writeFileSync(join(directory, 'proposal.md'), `# Proposal: ${change}\n`)
        writeFileSync(join(directory, 'design.md'), `# Design: ${change}\n`)
        writeFileSync(join(directory, 'tasks.md'), '# Tasks\n\n- [ ] 1.1 Demo task\n')
        mkdirSync(join(directory, 'specs', 'demo'), { recursive: true })
        writeFileSync(join(directory, 'specs', 'demo', 'spec.md'), '# Spec Delta: demo\n\n## ADDED Requirements\n\n### Requirement: Demo\n\nThe system SHALL demo.\n\n#### Scenario: Demo runs\n\n- **WHEN** the demo runs\n- **THEN** it passes\n')
        return run.project
      },
    },
    /**
     * Close the lab and finalize its report.
     * @param options - passed verdict and optional error.
     * @returns the run result.
     */
    async close({ passed = true, error } = {}) {
      if (state.closed) return { runDir: run.dir, kept: true }
      state.closed = true
      if (state.web !== undefined) await state.web.close().catch(() => {})
      if (mock !== undefined) await mock.close().catch(() => {})
      assertHostUnchanged(before, hostFingerprint())
      const report = {
        schemaVersion: 1,
        ok: passed,
        model,
        dsh: { version: dsh.version, source: dsh.source, cacheKey: dsh.cacheKey, cacheHit: dsh.cacheHit },
        node: process.versions.node,
        plugin: {
          name: pluginTarball.name,
          version: pluginTarball.version,
          sha512: pluginTarball.sha512,
          dirty: pluginTarball.dirty,
          head: pluginTarball.head,
        },
        error: error === undefined ? undefined : String(error?.stack ?? error),
        checks: [{ name: 'scenario', status: passed ? 'ok' : 'fail', detail: passed ? 'scenario completed' : String(error?.message ?? error) }],
      }
      return finalizeRun(run, { passed, report, keep, cleanup })
    },
  }
  return api
}

/**
 * Import and validate one scenario file.
 * @param file - absolute path.
 * @returns the scenario.
 */
export async function loadScenario(file) {
  const module = await import(pathToFileURL(file).href)
  const scenario = module.default
  if (scenario === null || typeof scenario !== 'object') throw new Error(`${file} has no default scenario`)
  return defineScenario(scenario)
}

/**
 * Run scenario files.
 * @param options - files, model flags, plugin, cleanup and environment.
 * @returns `{ passed, results }`.
 */
export async function runScenarios({
  files,
  mockOnly = false,
  includeReal = false,
  plugin,
  keep = false,
  cleanup = false,
  offline = false,
  fresh = false,
  root = ROOT,
  env = process.env,
  log = console,
} = {}) {
  if (includeReal && (env.CI === '1' || env.GIT_PUSH === '1' || !process.stdin.isTTY)) {
    throw new Error('--include-real-model is only allowed in an interactive local run')
  }
  const tarball = plugin ?? packPlugin({ root, outDir: join(root, '.cache', 'lab', 'tarballs', String(Date.now())), env })
  const results = []
  for (const file of files) {
    const scenario = await loadScenario(file)
    const canRun = scenario.model === 'mock' || includeReal
    if (mockOnly && scenario.model !== 'mock') {
      results.push({ name: scenario.name, file, status: 'skipped', reason: 'real model excluded by --mock-only' })
      continue
    }
    if (!canRun) {
      results.push({ name: scenario.name, file, status: 'skipped', reason: 'real model requires --include-real-model' })
      continue
    }
    const lab = await createLab({ pluginTarball: tarball, model: scenario.model, keep, cleanup, offline, fresh, root, env })
    try {
      await scenario.run(lab)
      const closed = await lab.close({ passed: true })
      results.push({ name: scenario.name, file, status: 'passed', runDir: closed.runDir })
      log.log(`PASS ${scenario.name}`)
    } catch (error) {
      const closed = await lab.close({ passed: false, error })
      results.push({ name: scenario.name, file, status: 'failed', error: String(error), runDir: closed.runDir })
      log.error(`FAIL ${scenario.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { passed: results.every((result) => result.status !== 'failed'), results, tarball }
}

/**
 * Assert a headless run completed.
 * @param run - headless result.
 * @returns nothing.
 */
export function expectCompleted(run) {
  if (!run.completed) throw new Error(`headless run did not complete: exit ${run.status}${run.stderr ? `: ${run.stderr.slice(-1_000)}` : ''}`)
}

/**
 * Assert a tool was called.
 * @param run - headless result.
 * @param name - tool name.
 * @returns nothing.
 */
export function expectToolCalled(run, name) {
  if (!run.events.some((event) => event.type === 'tool_call' && event.tool === name)) {
    throw new Error(`tool ${name} was not called`)
  }
}
