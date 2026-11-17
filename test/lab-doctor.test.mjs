import test from 'node:test'
import assert from 'node:assert/strict'
import { checkCjkFont, formatDoctor, runDoctor } from '../scripts/lab/core/doctor.mjs'

function ok(name) {
  return { name, status: 'ok', detail: 'fixture' }
}

function deps(overrides = {}) {
  return {
    runtime: ok('runtime'),
    cache: () => ({ name: 'dsh-cache', status: 'info', detail: 'will install' }),
    browser: () => ({ ...ok('browser-binary'), detail: '/fixture/chrome' }),
    libraries: () => ok('browser-libraries'),
    font: () => ok('cjk-font'),
    disk: () => ok('disk'),
    ...overrides,
  }
}

test('a missing DSH cache is informational, not a failure', () => {
  const result = runDoctor({ version: '0.0.0-test', deps: deps() })
  assert.equal(result.ok, true)
  assert.equal(result.checks.find((check) => check.name === 'dsh-cache').status, 'info')
  assert.match(formatDoctor(result).at(-1), /ready/)
})

test('a missing CJK font fails the doctor', () => {
  const result = runDoctor({
    version: '0.0.0-test',
    deps: deps({ font: () => ({ name: 'cjk-font', status: 'fail', detail: 'install Noto' }) }),
  })
  assert.equal(result.ok, false)
  assert.match(formatDoctor(result).join('\n'), /FAIL cjk-font/)
})

test('a missing browser binary names the install command', () => {
  const result = runDoctor({
    version: '0.0.0-test',
    deps: deps({
      browser: () => ({
        name: 'browser-binary',
        status: 'fail',
        detail: 'run PLAYWRIGHT_BROWSERS_PATH=.cache/lab/pw-browsers npx playwright install chromium',
      }),
    }),
  })
  assert.equal(result.ok, false)
  assert.match(result.checks[2].detail, /PLAYWRIGHT_BROWSERS_PATH/)
})

test('a missing fc-list returns a correction-oriented failure', () => {
  const check = checkCjkFont({ PATH: '/definitely/missing' }, 'linux')
  assert.equal(check.status, 'fail')
  assert.match(check.detail, /FONTCONFIG_FILE|CJK font/)
})

test('the doctor checks the browser path the run will use', () => {
  let seen
  const result = runDoctor({
    version: '0.0.0-test',
    browsersPath: '/opt/playwright',
    deps: deps({
      browser: (path) => {
        seen = path
        return { ...ok('browser-binary'), detail: '/opt/playwright/chrome' }
      },
    }),
  })
  assert.equal(seen, '/opt/playwright')
  assert.equal(result.ok, true)
})

test('an unsupported runtime fails before any DSH check', () => {
  const result = runDoctor({
    version: '0.0.0-test',
    deps: deps({ runtime: { name: 'runtime', status: 'fail', detail: 'requires Node 24.9.0' } }),
  })
  assert.equal(result.ok, false)
  assert.equal(result.checks[0].name, 'runtime')
})
