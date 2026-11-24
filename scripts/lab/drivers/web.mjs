/**
 * Playwright helpers for the isolated Web GUI.
 *
 * The browser is loaded lazily so unit tests and headless-only runs do not
 * need Playwright. The browser binary path is set by the caller through
 * `PLAYWRIGHT_BROWSERS_PATH`.
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, relative } from 'node:path'

/**
 * Load Playwright from the repository's development dependencies.
 * @returns the Playwright module.
 */
export async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch (error) {
    throw new Error(`Playwright is not installed; run npm install. ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Record console errors, uncaught page errors and failed requests for one page.
 * @param page - Playwright page.
 * @returns `{ errors, pageErrors, failures }`.
 */
export function watchPage(page) {
  const errors = []
  const pageErrors = []
  const failures = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => {
    const text = String(error)
    errors.push(text)
    pageErrors.push(text)
  })
  page.on('requestfailed', (request) => failures.push(`${request.method()} ${request.url()}`))
  return { errors, pageErrors, failures }
}

/**
 * Launch Chromium and open one page.
 * @param options - URL, viewport and headless flag.
 * @returns `{ browser, page, errors, pageErrors, failures }`.
 */
export async function openPage({ url, headless = true, viewport = { width: 1440, height: 1200 }, browsersPath, fontConfig }) {
  if (browsersPath !== undefined) process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
  if (fontConfig !== undefined) process.env.FONTCONFIG_FILE = fontConfig
  const { chromium } = await loadPlaywright()
  const browser = await chromium.launch({ headless })
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const watched = watchPage(page)
  if (url !== undefined) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  return { browser, page, ...watched }
}

/**
 * Fail when the loaded page raised an uncaught error.
 * @param pageErrors - recorded uncaught page errors.
 * @returns nothing.
 */
export function assertNoPageError(pageErrors) {
  if (pageErrors.length > 0) {
    throw new Error(`the page raised an uncaught error: ${pageErrors.join('; ')}`)
  }
}

/**
 * Enforce the Web GUI open conditions and keep a screenshot of the page.
 * @param options - page, recorded page errors, screenshot path and the run's screenshot list.
 * @returns the screenshot path.
 */
export async function confirmPageLoaded({ page, pageErrors, path, screenshots }) {
  assertNoPageError(pageErrors)
  await screenshot(page, path)
  screenshots.push(path)
  return path
}

/**
 * Dismiss the preview notice and the get-started dialog when present.
 * @param page - Playwright page.
 * @returns nothing.
 */
export async function dismissOnboarding(page) {
  for (let pass = 0; pass < 2; pass++) {
    const continueButton = page.getByRole('button', { name: 'Continue', exact: true })
    if ((await continueButton.count()) > 0) {
      await continueButton.click()
      await page.waitForTimeout(700)
    }
    const addKey = page.getByRole('button', { name: 'Add API Key', exact: true })
    if ((await addKey.count()) > 0) {
      await addKey.click()
      await page.waitForTimeout(400)
      const later = page.getByRole('button', { name: 'Configure later', exact: true })
      if ((await later.count()) > 0) await later.click()
      await page.waitForTimeout(500)
    }
  }
  await page.waitForTimeout(700)
}

/**
 * Select a workspace through the directory picker and wait until the page shows it.
 * @param page - Playwright page.
 * @param directory - absolute project directory.
 * @returns nothing.
 */
export async function chooseWorkspace(page, directory) {
  const name = basename(directory)
  const choose = page.getByRole('button', { name: 'Choose workspace', exact: true })
  if ((await choose.count()) === 0) throw new Error('the page shows no "Choose workspace" button')
  await page.waitForTimeout(800)
  await choose.click({ force: true, timeout: 20_000 })
  await page.waitForTimeout(800)
  const hidden = page.getByRole('button', { name: 'Show hidden files', exact: true })
  if ((await hidden.count()) > 0) await hidden.click()
  const segments = relative(homedir(), directory).split(/[\\/]/).filter(Boolean)
  const dialog = page.getByRole('dialog')
  const home = page.getByRole('button', { name: 'Home', exact: true })
  if ((await home.count()) > 0) await home.click()
  let parent = 'Home'
  for (const segment of segments) {
    const item = dialog.getByText(segment, { exact: true }).first()
    if ((await item.count()) === 0) throw new Error(`the directory picker shows no ${segment} under ${parent}`)
    await item.click()
    parent = segment
    await page.waitForTimeout(350)
  }
  const open = page.getByRole('button', { name: 'Open', exact: true })
  if ((await open.count()) === 0) throw new Error('the directory picker shows no "Open" button')
  await open.click({ force: true })
  await page.waitForTimeout(1_500)
  try {
    await page.getByText(name, { exact: true }).first().waitFor({ timeout: 15_000 })
  } catch {
    throw new Error(`the page does not show the selected workspace ${name}`)
  }
}

/**
 * Open a session by its visible text.
 * @param page - Playwright page.
 * @param text - session title or first message.
 * @returns nothing.
 */
export async function openSession(page, text) {
  const item = page.getByText(text, { exact: false }).first()
  if ((await item.count()) > 0) {
    await item.click()
    await page.waitForTimeout(500)
  }
}

/**
 * Send one message from the composer.
 * @param page - Playwright page.
 * @param text - message text.
 * @returns nothing.
 */
export async function send(page, text) {
  const editor = page.locator('textarea, [contenteditable="true"]').first()
  await editor.click({ force: true, timeout: 20_000 })
  await editor.fill(text, { force: true })
  await editor.press('Enter')
}

/**
 * Wait for one text to appear.
 * @param page - Playwright page.
 * @param text - expected text.
 * @param timeout - maximum wait.
 * @returns nothing.
 */
export async function expectText(page, text, timeout = 15_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout })
}

/**
 * Save a screenshot.
 * @param page - Playwright page.
 * @param path - destination.
 * @returns nothing.
 */
export async function screenshot(page, path) {
  await page.screenshot({ path, fullPage: false })
}

/**
 * Wait until the page has a usable body.
 * @param page - Playwright page.
 * @returns nothing.
 */
export async function waitForShell(page) {
  await page.waitForFunction(() => document.body !== null && document.body.innerText.trim() !== '', { timeout: 30_000 })
}

/**
 * Check whether a browser is present at one path.
 * @param browsersPath - Playwright browser root.
 * @returns true when a Chromium binary exists.
 */
export function browserPresent(browsersPath) {
  return existsSync(join(browsersPath))
}
