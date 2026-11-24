import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  checkBrowser,
  checkBrowserLibraries,
  checkCache,
  checkCjkFont,
  checkDisk,
  checkPnpm,
  formatDoctor,
  PNPM_VERSION,
  runDoctor,
} from '../scripts/lab/core/doctor.mjs'

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

function tempDir(t, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('a missing DSH cache is informational, not a failure', (t) => {
  const cacheBase = tempDir(t, 'openspec-dsh-cache-')
  const result = runDoctor({ version: '0.0.0-test', cacheBase, deps: deps({ cache: undefined }) })
  const cache = result.checks.find((check) => check.name === 'dsh-cache')
  assert.equal(cache.status, 'info')
  assert.match(cache.detail, /0\.0\.0-test is not cached; the run will install it/)
  assert.equal(result.ok, true)
  const lines = formatDoctor(result)
  assert.match(lines.find((line) => line.includes('dsh-cache')), /^INFO dsh-cache:/)
  assert.match(lines.at(-1), /ready/)
})

test('a missing browser binary names the install command', (t) => {
  const browsersPath = tempDir(t, 'openspec-lab-pw-')
  const result = runDoctor({ version: '0.0.0-test', browsersPath, deps: deps({ browser: undefined }) })
  const browser = result.checks.find((check) => check.name === 'browser-binary')
  assert.equal(browser.status, 'fail')
  assert.ok(browser.detail.includes(`no Playwright browser under ${browsersPath}`))
  assert.ok(browser.detail.includes(`PLAYWRIGHT_BROWSERS_PATH=${browsersPath} npx playwright install chromium`))
  assert.equal(result.ok, false)
  assert.match(formatDoctor(result).join('\n'), /FAIL browser-binary/)
})

test('a missing pnpm fails the doctor with the pinned install command', () => {
  const result = runDoctor({ version: '0.0.0-test', env: { PATH: '/definitely/missing' }, deps: deps({ pnpm: undefined }) })
  const pnpm = result.checks.find((check) => check.name === 'pnpm')
  assert.equal(pnpm.status, 'fail')
  assert.ok(pnpm.detail.includes(`npm install --global pnpm@${PNPM_VERSION}`))
  assert.equal(result.ok, false)
  assert.match(formatDoctor(result).join('\n'), /FAIL pnpm/)
})

test('a missing CJK font fails the doctor', (t) => {
  const bin = tempDir(t, 'openspec-lab-font-')
  writeFileSync(join(bin, 'fc-list'), '#!/bin/sh\nexit 0\n')
  chmodSync(join(bin, 'fc-list'), 0o755)
  const result = runDoctor({ version: '0.0.0-test', platform: 'linux', env: { PATH: bin }, deps: deps({ font: undefined }) })
  const font = result.checks.find((check) => check.name === 'cjk-font')
  assert.equal(font.status, 'fail')
  assert.match(font.detail, /fonts-wqy-zenhei/)
  assert.equal(result.ok, false)
  assert.match(formatDoctor(result).join('\n'), /FAIL cjk-font/)
})

test('a missing pnpm reports a correction-oriented failure', () => {
  const check = checkPnpm({ PATH: '/definitely/missing' })
  assert.equal(check.status, 'fail')
  assert.match(check.detail, /pnpm/)
  assert.ok(check.detail.includes(`npm install --global pnpm@${PNPM_VERSION}`))
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

test('checkCache reports an empty cache and a verified entry', (t) => {
  const base = tempDir(t, 'openspec-lab-cache-')
  const empty = checkCache('9.9.9', base)
  assert.equal(empty.name, 'dsh-cache')
  assert.equal(empty.status, 'info')
  assert.match(empty.detail, /9\.9\.9 is not cached; the run will install it/)

  const entry = join(base, '9.9.9', 'node24-test')
  const packageDir = join(entry, 'node_modules', '@deepseek-ai', 'dsh')
  mkdirSync(join(packageDir, 'lib'), { recursive: true })
  writeFileSync(join(entry, 'manifest.json'), JSON.stringify({ version: '9.9.9' }))
  writeFileSync(join(entry, '.complete'), '9.9.9\n')
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ version: '9.9.9' }))
  writeFileSync(join(packageDir, 'lib', 'bin.js'), '')
  const cached = checkCache('9.9.9', base)
  assert.equal(cached.status, 'ok')
  assert.match(cached.detail, /^9\.9\.9 is cached \(9\.9\.9\/node24-test\)$/)
})

test('checkBrowser reports a missing root and finds an installed executable', (t) => {
  const browsersPath = tempDir(t, 'openspec-lab-pw-')
  const missing = checkBrowser(browsersPath, 'linux')
  assert.equal(missing.name, 'browser-binary')
  assert.equal(missing.status, 'fail')
  assert.ok(missing.detail.includes(`no Playwright browser under ${browsersPath}`))
  assert.ok(missing.detail.includes(`PLAYWRIGHT_BROWSERS_PATH=${browsersPath}`))

  const executable = join(browsersPath, 'chromium-1234', 'chrome-linux', 'chrome-headless-shell')
  mkdirSync(join(browsersPath, 'chromium-1234', 'chrome-linux'), { recursive: true })
  writeFileSync(executable, '')
  const present = checkBrowser(browsersPath, 'linux')
  assert.equal(present.status, 'ok')
  assert.equal(present.detail, executable)
})

test('checkBrowserLibraries names a missing shared library', (t) => {
  const bin = tempDir(t, 'openspec-lab-ldd-')
  const previousPath = process.env.PATH
  t.after(() => {
    process.env.PATH = previousPath
  })
  const ldd = join(bin, 'ldd')
  writeFileSync(ldd, '#!/bin/sh\necho "libnss3.so => not found"\n')
  chmodSync(ldd, 0o755)
  process.env.PATH = bin

  const missing = checkBrowserLibraries('/opt/pw/chrome', 'linux')
  assert.equal(missing.name, 'browser-libraries')
  assert.equal(missing.status, 'fail')
  assert.match(missing.detail, /libnss3\.so => not found/)
  assert.match(missing.detail, /playwright install-deps chromium/)

  writeFileSync(ldd, '#!/bin/sh\necho "libnss3.so => /usr/lib/libnss3.so"\n')
  const resolved = checkBrowserLibraries('/opt/pw/chrome', 'linux')
  assert.equal(resolved.status, 'ok')
  assert.match(resolved.detail, /all shared libraries resolve/)

  assert.equal(checkBrowserLibraries('/opt/pw/chrome', 'darwin').status, 'info')
})

test('checkDisk measures free space under a real directory', (t) => {
  const dir = tempDir(t, 'openspec-lab-disk-')
  const check = checkDisk(dir)
  assert.equal(check.name, 'disk')
  assert.equal(check.status, 'ok')
  assert.match(check.detail, /^\d+ MiB free$/)

  const absent = checkDisk(join(dir, 'missing'))
  assert.equal(absent.status, 'ok')
  assert.match(absent.detail, /does not exist yet/)
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
