import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
 * A page that models the workspace picker's own state, without a browser.
 *
 * The directory is deliberately outside any home directory: the picker opens at
 * the project level, so a walk from Home cannot reach it and the driver has to
 * use the path editor.
 * @param options - which controls exist and how the picker behaves.
 * @returns `{ page, calls }`.
 */
function pickerPage({
  chip = true,
  picker = true,
  menu = false,
  addOpens = true,
  editor = true,
  enters = true,
  crumbs = true,
  open = true,
  closes = true,
  adopts = true,
} = {}) {
  const calls = []
  const state = { dialog: false, menu: false, editing: false, draft: '', label: 'Choose workspace', crumbs: [] }
  const waiter = (attached, label) => async ({ state: want = 'visible' } = {}) => {
    const present = await attached()
    if (want === 'detached' ? present : !present) throw new Error(`${label} never reached ${want}`)
    calls.push(`wait:${want}:${label}`)
  }
  const chipLocator = {
    count: async () => (chip ? 1 : 0),
    click: async () => {
      calls.push('click:Choose workspace')
      state.dialog = picker && !menu
      state.menu = picker && menu
    },
    first() {
      return this
    },
    getByText: (text, options) => {
      const matches = () => (options?.exact === true ? state.label === text : state.label.includes(text))
      return {
        count: async () => (matches() ? 1 : 0),
        waitFor: waiter(matches, 'chip label'),
      }
    },
  }
  const editLocator = {
    count: async () => (editor ? 1 : 0),
    click: async () => {
      calls.push('click:Edit path')
      state.editing = true
    },
    first() {
      return this
    },
    waitFor: waiter(async () => state.dialog && editor, 'Edit path'),
  }
  const inputLocator = {
    count: async () => (state.editing ? 1 : 0),
    fill: async (value) => {
      calls.push(`fill:${value}`)
      state.draft = value
    },
    press: async (key) => {
      calls.push(`press:${key}`)
      if (!enters) return
      state.editing = false
      state.crumbs = crumbs ? [state.draft.split('/').filter(Boolean).at(-1)] : []
    },
    first() {
      return this
    },
    waitFor: waiter(async () => state.editing, 'Edit path field'),
  }
  const addLocator = {
    count: async () => (state.menu ? 1 : 0),
    click: async () => {
      calls.push('click:Add workspace…')
      state.menu = false
      state.dialog = addOpens
    },
    first() {
      return this
    },
    waitFor: waiter(async () => state.menu, 'Add workspace…'),
  }
  const crumbLocator = {
    getByText: (text) => ({ count: async () => (state.crumbs.includes(text) ? 1 : 0) }),
  }
  const dialogLocator = {
    count: async () => (state.dialog ? 1 : 0),
    waitFor: waiter(async () => state.dialog, 'dialog'),
    getByRole: () => crumbLocator,
    getByText: () => ({ count: async () => 0 }),
  }
  const openLocator = {
    count: async () => (state.dialog && open ? 1 : 0),
    click: async () => {
      calls.push('click:Open')
      state.dialog = !closes
      if (adopts) state.label = 'project'
    },
    first() {
      return this
    },
  }
  const page = {
    calls,
    getByRole: (role, options) => {
      if (role === 'dialog') return dialogLocator
      if (role === 'textbox') return inputLocator
      if (options?.name === 'Open') return openLocator
      return chipLocator
    },
    getByLabel: () => editLocator,
    getByText: (text) => (text === 'Add workspace…' ? addLocator : { count: async () => 0, first() { return this } }),
    waitForTimeout: async () => {},
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

const TARGET = '/srv/lab/project'

test('onboarding helpers click the expected controls', async () => {
  const { page, calls } = fakePage()
  await dismissOnboarding(page)
  assert.ok(calls.includes('click:Continue'))
  assert.ok(calls.includes('click:Add API Key'))
  assert.ok(calls.includes('click:Configure later'))
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

test('chooseWorkspace enters the directory through the path editor and requires adoption', async () => {
  const { page, calls } = pickerPage()
  await chooseWorkspace(page, TARGET)
  assert.deepEqual(calls, [
    'click:Choose workspace',
    'wait:visible:dialog',
    'click:Edit path',
    `fill:${TARGET}`,
    'press:Enter',
    'wait:detached:Edit path field',
    'click:Open',
    'wait:detached:dialog',
    'wait:visible:chip label',
  ])
})

test('chooseWorkspace opens the directory picker from the workspace menu', async () => {
  const { page, calls } = pickerPage({ menu: true })
  await chooseWorkspace(page, TARGET)
  assert.deepEqual(calls, [
    'click:Choose workspace',
    'wait:visible:Add workspace…',
    'click:Add workspace…',
    'wait:visible:dialog',
    'click:Edit path',
    `fill:${TARGET}`,
    'press:Enter',
    'wait:detached:Edit path field',
    'click:Open',
    'wait:detached:dialog',
    'wait:visible:chip label',
  ])
})

test('chooseWorkspace throws when the add entry opens nothing', async () => {
  const { page } = pickerPage({ menu: true, addOpens: false })
  await assert.rejects(chooseWorkspace(page, TARGET), /"Add workspace…" entry did not open/)
})

test('chooseWorkspace throws when the page offers no workspace picker', async () => {
  const { page } = pickerPage({ chip: false })
  await assert.rejects(chooseWorkspace(page, TARGET), /no "Choose workspace" button/)
})

test('chooseWorkspace throws when the picker does not open', async () => {
  const { page } = pickerPage({ picker: false })
  await assert.rejects(chooseWorkspace(page, TARGET), /picker did not open/)
})

test('chooseWorkspace throws when the picker offers no path editor', async () => {
  const { page } = pickerPage({ editor: false })
  await assert.rejects(chooseWorkspace(page, TARGET), /no "Edit path" field/)
})

test('chooseWorkspace throws when the picker does not enter the directory', async () => {
  const { page } = pickerPage({ enters: false })
  await assert.rejects(chooseWorkspace(page, TARGET), /did not enter \/srv\/lab\/project/)
})

test('chooseWorkspace throws when the breadcrumb does not name the directory', async () => {
  const { page } = pickerPage({ crumbs: false })
  await assert.rejects(chooseWorkspace(page, TARGET), /shows no project after entering \/srv\/lab\/project/)
})

test('chooseWorkspace throws when the picker offers no Open button', async () => {
  const { page } = pickerPage({ open: false })
  await assert.rejects(chooseWorkspace(page, TARGET), /no "Open" button/)
})

test('chooseWorkspace throws when the picker stays open', async () => {
  const { page } = pickerPage({ closes: false })
  await assert.rejects(chooseWorkspace(page, TARGET), /stayed open after Open/)
})

test('chooseWorkspace throws when the page does not adopt the workspace', async () => {
  const { page } = pickerPage({ adopts: false })
  await assert.rejects(chooseWorkspace(page, TARGET), /does not show the workspace project after selection/)
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
