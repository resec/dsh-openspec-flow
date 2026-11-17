import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  browserPresent,
  chooseWorkspace,
  dismissOnboarding,
  openSession,
  send,
  screenshot,
} from '../scripts/lab/drivers/web.mjs'

/**
 * A page-shaped recorder for the helper sequence, without a browser.
 * @returns `{ page, calls }`.
 */
function fakePage() {
  const calls = []
  const locator = (name) => ({
    count: async () => 1,
    click: async () => calls.push(`click:${name}`),
    fill: async (value) => calls.push(`fill:${value}`),
    press: async (key) => calls.push(`press:${key}`),
    waitFor: async () => calls.push(`wait:${name}`),
    first() {
      return this
    },
    getByText: (text) => locator(text),
    getByRole: (_role, options) => locator(options?.name ?? 'dialog'),
  })
  const page = {
    calls,
    getByRole: (_role, options) => locator(options?.name ?? 'button'),
    getByText: (text) => locator(text),
    locator: (selector) => locator(selector),
    waitForTimeout: async () => {},
    screenshot: async (options) => calls.push(`screenshot:${options.path}`),
  }
  return { page, calls }
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

test('browserPresent is false for an empty directory', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-lab-browser-'))
  try {
    assert.equal(browserPresent(directory), true)
    rmSync(directory, { recursive: true, force: true })
    assert.equal(browserPresent(directory), false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
