import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkCjkFont, checkPnpm, formatDoctor, PNPM_VERSION, runDoctor } from '../scripts/lab/core/doctor.mjs'
import { buildRecord, pnpmBucket, writeRecord } from '../scripts/toolchain.mjs'

function ok(name) {
  return { name, status: 'ok', detail: 'fixture' }
}

function deps(overrides = {}) {
  return {
    runtime: ok('runtime'),
    pnpm: () => ok('pnpm'),
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
  assert.match(result.checks.find((check) => check.name === 'browser-binary').detail, /PLAYWRIGHT_BROWSERS_PATH/)
})

test('a missing pnpm fails the doctor with the pinned install command', () => {
  const result = runDoctor({
    version: '0.0.0-test',
    deps: deps({
      pnpm: () => ({
        name: 'pnpm',
        status: 'fail',
        detail: `install pnpm@${PNPM_VERSION} and retry`,
      }),
    }),
  })
  assert.equal(result.ok, false)
  assert.equal(result.checks.find((check) => check.name === 'pnpm').status, 'fail')
  assert.match(formatDoctor(result).join('\n'), /FAIL pnpm/)
})

test('a missing pnpm reports a correction-oriented failure', () => {
  const check = checkPnpm({ PATH: '/definitely/missing' })
  assert.equal(check.status, 'fail')
  assert.match(check.detail, /pnpm/)
  assert.ok(check.detail.includes('--deps-only'))
})

test('a missing fc-list returns a correction-oriented failure', () => {
  const check = checkCjkFont({ PATH: '/definitely/missing' }, 'linux')
  assert.equal(check.status, 'fail')
  assert.match(check.detail, /FONTCONFIG_FILE|CJK font/)
})

test('a missing CJK font names the package CI installs', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'openspec-cjk-font-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const bin = join(dir, 'fc-list')
  writeFileSync(bin, '#!/bin/sh\nexit 0\n')
  chmodSync(bin, 0o755)
  const check = checkCjkFont({ PATH: dir }, 'linux')
  assert.equal(check.status, 'fail')
  assert.match(check.detail, /fonts-wqy-zenhei/)
  assert.match(check.detail, /FONTCONFIG_FILE/)
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


test('the doctor uses the current record and refuses a stale one', () => {
  const root = mkdtempSync(join(tmpdir(), 'lab-doctor-record-'))
  try {
    writeFileSync(join(root, 'package.json'), '{"engines":{"node":">=24.9.0"}}\n')
    writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}\n')
    writeFileSync(join(root, 'coverage.baseline.json'), '{"node":{"version":"v24.22.2"}}\n')
    writeFileSync(join(root, 'coverage.config.json'), '{"primaryNodeMajor":24}\n')
    const pnpmJs = join(root, 'pnpm.mjs')
    const binDir = join(root, 'bin')
    writeFileSync(pnpmJs, `console.log('${PNPM_VERSION}')\n`)
    mkdirSync(binDir, { recursive: true })
    writeRecord(root, buildRecord({
      root,
      requirements: { nodeRange: '>=24.9.0', primaryNodeMajor: 24, pnpm: PNPM_VERSION },
      node: { path: process.execPath, version: process.version, source: 'host' },
      npm: { path: process.execPath, version: '11.0.0' },
      pnpm: { bucket: pnpmBucket('/shared'), version: PNPM_VERSION, js: pnpmJs, binDir, node: process.execPath },
      chromium: null,
    }))
    const current = checkPnpm({}, root)
    assert.equal(current.status, 'ok')
    assert.match(current.detail, /recorded pnpm/)
    writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{"x":{}}}\n')
    const stale = checkPnpm({}, root)
    assert.equal(stale.status, 'fail')
    assert.match(stale.detail, /--deps-only/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
