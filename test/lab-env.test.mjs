import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import test from 'node:test'
import { ROOT } from '../scripts/lab/core/paths.mjs'
import { createRun } from '../scripts/lab/core/run-dir.mjs'
import { WEB_START_ARGS, labEnvironmentForRun } from '../scripts/lab/index.mjs'

test('the lab environment keeps DSH_HOME under the run and adopts exported caches', (t) => {
  const base = mkdtempSync(join(tmpdir(), 'dsh-lab-env-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const run = createRun({ base })
  const environment = labEnvironmentForRun({
    root: ROOT,
    run,
    env: { PLAYWRIGHT_BROWSERS_PATH: '/shared/pw', LAB_NPM_CACHE: '/shared/npm' },
  })
  assert.equal(environment.DSH_HOME, run.home)
  assert.equal(environment.DSH_AGENTS_HOME, run.agentsHome)
  assert.equal(environment.PLAYWRIGHT_BROWSERS_PATH, '/shared/pw')
  assert.equal(environment.LAB_NPM_CACHE, '/shared/npm')
  assert.equal(environment.DSH_HOME.startsWith(`${run.dir}${sep}`), true)
  assert.equal(relative(run.dir, join(environment.DSH_HOME, 'profiles', 'verify-mock')), join('home', 'profiles', 'verify-mock'))
})

test('a custom lab root keeps its browser default without the environment', () => {
  const root = join(ROOT, 'custom-lab-root')
  const run = { home: '/tmp/lab-run/home', agentsHome: '/tmp/lab-run/agents' }
  assert.equal(
    labEnvironmentForRun({ root, run, env: {} }).PLAYWRIGHT_BROWSERS_PATH,
    join(root, '.cache', 'lab', 'pw-browsers'),
  )
})

test('the web profile starts on an OS-assigned port', () => {
  const portIndex = WEB_START_ARGS.indexOf('--port')
  assert.ok(portIndex >= 0)
  assert.equal(WEB_START_ARGS[portIndex + 1], '0')
})
