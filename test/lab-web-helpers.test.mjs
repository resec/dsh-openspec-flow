import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  assertNoPageError,
  browserPresent,
  chooseWorkspace,
  confirmPageLoaded,
  dismissOnboarding,
  openSession,
  send,
  screenshot,
  watchPage,
} from '../scripts/lab/drivers/web.mjs'

/**
 * A page-shaped recorder for the helper sequence, without a browser.
 * @param options - which locators are absent and what a screenshot writes.
 * @returns `{ page, calls }`.
 */
function fakePage({ present = () => true, onScreenshot } = {}) {
  const calls = []
  const locator = (name, kind = 'page') => ({
    count: async () => (present(name, kind) ? 1 : 0),
    click: async () => calls.push(`click:${name}`),
    fill: async (value) => calls.push(`fill:${value}`),
    press: async (key) => calls.push(`press:${key}`),
    waitFor: async () => {
      if (!present(name, kind)) throw new Error(`locator ${name} never appeared`)
      calls.push(`wait:${name}`)
    },
    first() {
      return this
    },
    getByText: (text) => locator(text, 'dialog'),
    getByRole: (_role, options) => locator(options?.name ?? 'dialog', kind),
  })
  const page = {
    calls,
    getByRole: (_role, options) => locator(options?.name ?? 'button'),
    getByText: (text) => locator(text),
    locator: (selector) => locator(selector),
    waitForTimeout: async () => {},
    screenshot: async (options) => {
      onScreenshot?.(options.path)
      calls.push(`screenshot:${options.path}`)
    },
  }
  return { page, calls }
}

/**
 * A page that only emits the driver's recorded events.
 * @returns `{ on, emit }`.
 */
function eventPage() {
  const handlers = new Map()
  return {
    on(event, handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
    },
    emit(event, value) {
      for (const handler of handlers.get(event) ?? []) handler(value)
    },
  }
}

test('onboarding and workspace helpers click the expected controls', async () => {
  const { page, calls } = fakePage()
  await dismissOnboarding(page)
  assert.ok(calls.includes('click:Continue'))
  assert.ok(calls.includes('click:Add API Key'))
  assert.ok(calls.includes('click:Configure later'))

  await chooseWorkspace(page, join(homedir(), 'projects', 'demo'))
  assert.ok(calls.includes('click:Choose workspace'))
  assert.ok(calls.includes('click:projects'))
  assert.ok(calls.includes('click:demo'))
  assert.ok(calls.includes('click:Open'))
  assert.ok(calls.includes('wait:demo'))
})

test('send, openSession and screenshot drive the page', async () => {
  const { page, calls } = fakePage()
  await send(page, 'hello')
  assert.ok(calls.includes('fill:hello'))
  assert.ok(calls.includes('press:Enter'))
  await openSession(page, 'session title')
  assert.ok(calls.includes('click:session title'))
  await screenshot(page, 'shot.png')
  assert.ok(calls.includes('screenshot:shot.png'))
})

test('a page error fails the open check and keeps no screenshot', async () => {
  const page = eventPage()
  const watched = watchPage(page)
  page.emit('console', { type: () => 'log', text: () => 'quiet' })
  page.emit('console', { type: () => 'error', text: () => 'console boom' })
  page.emit('pageerror', new Error('boom'))
  page.emit('requestfailed', { method: () => 'GET', url: () => 'http://127.0.0.1:1/x.js' })
  assert.deepEqual(watched.errors, ['console boom', 'Error: boom'])
  assert.deepEqual(watched.pageErrors, ['Error: boom'])
  assert.deepEqual(watched.failures, ['GET http://127.0.0.1:1/x.js'])
  assert.doesNotThrow(() => assertNoPageError([]))

  const screenshots = []
  await assert.rejects(
    confirmPageLoaded({ page: fakePage().page, pageErrors: watched.pageErrors, path: 'web.png', screenshots }),
    /uncaught error: Error: boom/,
  )
  assert.deepEqual(screenshots, [])
})

test('the open check keeps a screenshot and records its path', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-lab-web-shot-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const path = join(directory, 'web.png')
  const { page } = fakePage({ onScreenshot: (target) => writeFileSync(target, 'png') })
  const screenshots = []
  assert.equal(await confirmPageLoaded({ page, pageErrors: [], path, screenshots }), path)
  assert.ok(existsSync(path))
  assert.deepEqual(screenshots, [path])
})

test('chooseWorkspace throws when the page offers no workspace picker', async () => {
  const { page } = fakePage({ present: (name) => name !== 'Choose workspace' })
  await assert.rejects(
    chooseWorkspace(page, join(homedir(), 'projects', 'demo')),
    /no "Choose workspace" button/,
  )
})

test('chooseWorkspace throws on a path segment the picker does not show', async () => {
  const { page } = fakePage({ present: (name, kind) => !(kind === 'dialog' && name === 'projects') })
  await assert.rejects(
    chooseWorkspace(page, join(homedir(), 'projects', 'demo')),
    /no projects under Home/,
  )
})

test('chooseWorkspace throws when the picker offers no Open button', async () => {
  const { page } = fakePage({ present: (name) => name !== 'Open' })
  await assert.rejects(
    chooseWorkspace(page, join(homedir(), 'projects', 'demo')),
    /no "Open" button/,
  )
})

test('chooseWorkspace throws when the page does not show the selected workspace', async () => {
  const { page } = fakePage({ present: (name, kind) => !(kind === 'page' && name === 'demo') })
  await assert.rejects(
    chooseWorkspace(page, join(homedir(), 'projects', 'demo')),
    /does not show the selected workspace demo/,
  )
})

test('browserPresent reports whether the browser root exists', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-lab-browser-'))
  try {
    assert.equal(browserPresent(directory), true)
    rmSync(directory, { recursive: true, force: true })
    assert.equal(browserPresent(directory), false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
