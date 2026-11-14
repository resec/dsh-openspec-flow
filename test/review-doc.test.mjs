/**
 * The review document, checked against the live tools and settings.
 *
 * The document is a repository document, not a packaged asset, so nothing at
 * runtime would notice it going stale. This test reads it as text and compares
 * the names it uses with the code: tools registered by both plugin halves, the
 * `openspec_review` action list, the review defaults, the record layout and the
 * README link. A negative case proves a stale name is reported by name.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { apply } from '../index.js'
import { apply as reviewerApply } from '../reviewer.js'
import {
  DEFAULT_APPLY_REVIEW,
  DEFAULT_DRAFT_REVIEW,
  DEFAULT_REVIEWER_MODEL,
} from '../lib/review/config.js'
import { APPLY_REVIEW_FILE, DRAFT_REVIEW_FILE } from '../lib/review/record.js'
import { REVIEW_DIRECTORY, REVIEW_IGNORE_LINE } from '../lib/review/store.js'
import { createFakeContext } from './fake-context.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DOC_PATH = join(ROOT, 'docs', 'review.md')

/** Tools the document must name because they carry the review flow. */
const REQUIRED_TOOLS = ['openspec_review', 'openspec_reviewer', 'openspec_apply_next', 'openspec_archive']

/** Review actions the document must show, because every phase names one. */
const REQUIRED_ACTIONS = ['start', 'resume', 'wait', 'status', 'self-report', 'report', 'dispose', 'extend', 'abandon']

/** OpenSpec CLI verbs a document must not present as an instruction. */
const CLI_COMMAND = /\bopenspec (?:validate|archive|list|status|show|new|init|update|view|diff|schemas|instructions|config|store|completion)\b/

/**
 * Read the live names the document is checked against.
 * @returns the tool map, the review action list, the defaults and the record layout.
 */
function liveCatalog() {
  // Both review sections must be enabled for the review tool to register.
  const fake = createFakeContext({ cwd: ROOT })
  apply(fake.ctx, {
    timeoutMs: 30_000,
    reviews: { draft: { enabled: true }, apply: { enabled: true } },
  })
  const reviewer = createFakeContext({ cwd: ROOT })
  reviewerApply(reviewer.ctx)
  const tools = new Map([...fake.tools, ...reviewer.tools])
  const reviewTool = fake.tools.get('openspec_review')
  assert.ok(reviewTool, 'openspec_review is registered')
  return {
    tools,
    reviewActions: reviewTool.parameters.properties.action.enum,
    defaults: {
      draft: DEFAULT_DRAFT_REVIEW,
      apply: DEFAULT_APPLY_REVIEW,
      reviewerModel: DEFAULT_REVIEWER_MODEL,
    },
    record: {
      root: `openspec/${REVIEW_DIRECTORY}/`,
      draftFile: DRAFT_REVIEW_FILE,
      applyFile: APPLY_REVIEW_FILE,
      ignore: REVIEW_IGNORE_LINE,
    },
  }
}

/**
 * Format one default the way the document's table spells it.
 * @param value - default value.
 * @returns the cell text.
 */
function cell(value) {
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object' && value !== null) {
    return `{ source: "${String(value.source)}" }`
  }
  return String(value)
}

/**
 * Check one document text against the live catalog.
 * @param text - the document.
 * @param spec - live names from {@link liveCatalog}.
 * @returns the problems, each naming the offending item.
 */
export function checkDocument(text, spec) {
  const problems = []
  for (const name of REQUIRED_TOOLS) {
    if (!text.includes(name)) problems.push(`missing tool ${name}`)
  }
  const mentioned = new Set(text.match(/openspec_[a-z_]+/gu) ?? [])
  for (const name of mentioned) {
    if (!spec.tools.has(name)) problems.push(`unknown tool ${name}`)
  }
  for (const action of REQUIRED_ACTIONS) {
    if (!text.includes(`"${action}"`)) problems.push(`missing action ${action}`)
  }
  // Action values are read per line, and only from lines that name
  // `openspec_review`: `openspec_reviewer` has its own read/submit/status
  // vocabulary, which is not this action list.
  for (const line of text.split('\n')) {
    if (!line.includes('openspec_review') || line.includes('openspec_reviewer')) continue
    for (const match of line.matchAll(/action"?\s*:\s*"([^"]+)"/gu)) {
      if (!spec.reviewActions.includes(match[1])) problems.push(`unknown action ${match[1]}`)
    }
  }
  for (const kind of ['draft', 'apply']) {
    const defaults = spec.defaults[kind]
    for (const [key, value] of Object.entries(defaults)) {
      const row = new RegExp(`^\\| \`reviews\\.${kind}\\.${key}\` \\| \`([^\`]+)\``, 'mu').exec(text)
      if (row === null) {
        problems.push(`missing config key reviews.${kind}.${key}`)
        continue
      }
      if (row[1] !== cell(value)) {
        problems.push(`stale default for reviews.${kind}.${key}: ${row[1]}, expected ${cell(value)}`)
      }
    }
  }
  if (!text.includes(spec.record.root)) problems.push(`missing record root ${spec.record.root}`)
  if (!text.includes('<store>#<change>')) problems.push('missing record key <store>#<change>')
  for (const name of [spec.record.draftFile, spec.record.applyFile]) {
    if (!text.includes(name)) problems.push(`missing record file ${name}`)
  }
  if (!text.includes(spec.record.ignore)) problems.push(`missing ignore entry ${spec.record.ignore}`)
  if (!text.includes('openspec/.gitignore')) problems.push('missing the ignored review root file')
  if (CLI_COMMAND.test(text)) {
    const match = CLI_COMMAND.exec(text)
    problems.push(`names an OpenSpec CLI command: ${String(match?.[0])}`)
  }
  return problems
}

/**
 * Check the README points at the document.
 * @param readme - README text.
 * @returns the problems.
 */
export function checkReadme(readme) {
  return readme.includes('docs/review.md') ? [] : ['README does not link docs/review.md']
}

test('the review document matches the live tools, actions, defaults and record layout', () => {
  const spec = liveCatalog()
  const text = readFileSync(DOC_PATH, 'utf8')
  assert.deepEqual(checkDocument(text, spec), [])
})

test('the README links the review document', () => {
  assert.deepEqual(checkReadme(readFileSync(join(ROOT, 'README.md'), 'utf8')), [])
})

test('the review document explains the apply status states', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  for (const phrase of ['`policy`', '`enabled`', '`available`', 'draft-only']) {
    assert.ok(text.includes(phrase), `the document names ${phrase}`)
  }
  assert.match(text, /没有 git 的项目只能用 draft review/)
  assert.match(text, /旧的策略文件可能仍记录/)
  assert.match(text, /无策略或只有 draft 段/)
  assert.match(text, /每个新的 draft\/apply 轮次/)
  assert.match(text, /唤醒同一个 reviewer/)
  assert.match(text, /不会重复唤醒/)
  assert.doesNotMatch(text, /归档会一直等到 apply review 就绪/)
})

test('the document covers both review kinds and both reviewer modes', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  for (const phrase of ['draft review', 'apply review', 'reviewers 0', 'reviewers 1', 'openspec-reviewer']) {
    assert.ok(text.includes(phrase), `the document names ${phrase}`)
  }
  assert.match(text, /reviewers`?.*`?0/s)
  assert.match(text, /reviewers`?.*`?1/s)
  assert.match(text, /draft brief 的开头在两种模式下相同/)
})

test('a stale tool, default or record path is reported by name', () => {
  const spec = liveCatalog()
  const text = readFileSync(DOC_PATH, 'utf8')

  const removedTool = text.replaceAll('openspec_apply_next', 'openspec_apply_old')
  const toolProblems = checkDocument(removedTool, spec)
  assert.ok(toolProblems.includes('missing tool openspec_apply_next'))
  assert.ok(toolProblems.includes('unknown tool openspec_apply_old'))

  const staleDefault = text.replace(
    '| `reviews.draft.maxRounds` | `3` |',
    '| `reviews.draft.maxRounds` | `9` |',
  )
  const defaultProblems = checkDocument(staleDefault, spec)
  assert.ok(
    defaultProblems.includes('stale default for reviews.draft.maxRounds: 9, expected 3'),
    defaultProblems.join('; '),
  )

  const renamedKey = text.replace('`reviews.apply.waitMinutes`', '`reviews.apply.wait`')
  const keyProblems = checkDocument(renamedKey, spec)
  assert.ok(keyProblems.includes('missing config key reviews.apply.waitMinutes'))

  const movedRoot = text.replaceAll(`openspec/${REVIEW_DIRECTORY}/`, 'openspec/reviews/')
  const pathProblems = checkDocument(movedRoot, spec)
  assert.ok(pathProblems.includes(`missing record root openspec/${REVIEW_DIRECTORY}/`))

  const cliCommand = `${text}\n\nopenspec validate --all\n`
  const cliProblems = checkDocument(cliCommand, spec)
  assert.ok(cliProblems.some((problem) => problem.startsWith('names an OpenSpec CLI command')))

  const unknownAction = text.replace('"action": "wait"', '"action": "pause"')
  assert.ok(checkDocument(unknownAction, spec).includes('unknown action pause'))

  assert.deepEqual(checkReadme('# README\n'), ['README does not link docs/review.md'])
})
