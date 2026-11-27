import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TEMPLATES = [
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/bug.md',
  '.github/ISSUE_TEMPLATE/task.md',
]
const SECTIONS = ['Linked issue', 'Change', 'Root cause', 'Scope', 'Evidence', 'Risk and rollback']
const SCRIPTS = Object.keys(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts)

/**
 * Read a template, reporting the path when it is absent.
 * @param path - repository-relative template path.
 * @returns the template contents.
 */
function readTemplate(path) {
  try {
    return readFileSync(join(ROOT, path), 'utf8')
  } catch {
    throw new Error(`missing template: ${path}`)
  }
}

/**
 * The level-two headings of a template, in order.
 * @param markdown - template contents.
 * @returns section titles.
 */
function sections(markdown) {
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim())
}

/**
 * The `npm run` script names a template asks the contributor to run.
 * @param markdown - template contents.
 * @returns script names.
 */
function commands(markdown) {
  return [...markdown.matchAll(/npm run ([A-Za-z0-9:_.-]+)/g)].map((match) => match[1])
}

/**
 * Check the pull request template against the repository body convention and the change gate.
 * @param markdown - pull request template contents.
 */
function assertPullRequestTemplate(markdown) {
  const actual = sections(markdown)
  for (const section of SECTIONS) {
    if (!actual.includes(section)) throw new Error(`pull request template has no "${section}" section`)
  }
  const extra = actual.filter((section) => !SECTIONS.includes(section))
  if (extra.length > 0) {
    throw new Error(`pull request template has sections the repository does not use: ${extra.join(', ')}`)
  }
  if (actual.join('|') !== SECTIONS.join('|')) {
    throw new Error(`pull request template sections are out of order: ${actual.join(', ')}`)
  }
  if (!/exactly one active change/i.test(markdown)) {
    throw new Error('pull request template must require exactly one active change')
  }
}

/**
 * Check that every command a template names is a package.json script.
 * @param path - template path, used in the error.
 * @param markdown - template contents.
 * @param scripts - package.json script names.
 */
function assertCommandsExist(path, markdown, scripts) {
  for (const name of commands(markdown)) {
    if (!scripts.includes(name)) throw new Error(`${path} names npm run ${name}, which package.json does not define`)
  }
}

test('the three contribution templates exist', () => {
  for (const path of TEMPLATES) {
    assert.ok(readTemplate(path).trim().length > 0, `${path} is empty`)
  }
})

test('the pull request template keeps the six body sections in order', () => {
  const markdown = readTemplate(TEMPLATES[0])
  assertPullRequestTemplate(markdown)
  assert.deepEqual(sections(markdown), SECTIONS)
})

test('the pull request template requires exactly one active change', () => {
  const markdown = readTemplate(TEMPLATES[0])
  assert.match(markdown, /exactly one active change/i)
  assert.doesNotMatch(markdown, /adds or updates an active change/i)
})

test('the templates list check:requirement-length among the self checks', () => {
  for (const path of TEMPLATES) assert.match(readTemplate(path), /npm run check:requirement-length/)
})

test('every npm run command in a template exists in package.json scripts', () => {
  for (const path of TEMPLATES) assertCommandsExist(path, readTemplate(path), SCRIPTS)
})

test('the checks reject the old wording, a stray section and an unknown command', () => {
  const pullRequest = readTemplate(TEMPLATES[0])
  assert.throws(
    () => assertPullRequestTemplate(pullRequest.replace(/Exactly one active change/i, 'Adds or updates an active change')),
    /exactly one active change/,
  )
  assert.throws(
    () => assertPullRequestTemplate(pullRequest.replace('## Risk and rollback\n', '')),
    /"Risk and rollback" section/,
  )
  assert.throws(
    () => assertPullRequestTemplate(`${pullRequest}\n## Checklist\n`),
    /sections the repository does not use: Checklist/,
  )
  assert.throws(
    () => assertCommandsExist('a-template.md', 'npm run no-such-script', SCRIPTS),
    /a-template\.md names npm run no-such-script/,
  )
  assert.throws(() => readTemplate('.github/ISSUE_TEMPLATE/missing.md'), /missing template/)
})
