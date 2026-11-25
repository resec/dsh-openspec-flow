import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { main, selectAffectedTests, SelectorError } from '../scripts/affected-tests.mjs'
import { COMPILE_CACHE, testEnvFor } from '../scripts/test-env.mjs'
import { DEFAULT_CONCURRENCY } from '../scripts/run-tests.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Capture stdout of one call while keeping the assertion outcome.
 * @param fn - async function to run.
 * @returns its return value and the printed lines.
 */
async function capture(fn) {
  const lines = []
  const original = console.log
  console.log = (...args) => lines.push(args.join(' '))
  try {
    const value = await fn()
    return { value, lines }
  } finally {
    console.log = original
  }
}

test('a directly imported module selects only the test files importing it', () => {
  const files = selectAffectedTests({ paths: ['lib/review/brief.js'] })
  assert.deepEqual(files, ['test/review-doc.test.mjs', 'test/review-reviewer.test.mjs', 'test/review-seal.test.mjs', 'test/review-unit.test.mjs'])
})

test('a module reached through a test helper selects every test using the helper', () => {
  const files = selectAffectedTests({ paths: ['test/review-fixtures.mjs'] })
  for (const expected of [
    'test/review-apply.test.mjs',
    'test/review-draft.test.mjs',
    'test/review-reviewer.test.mjs',
    'test/review-serial.test.mjs',
    'test/review-wait.test.mjs',
  ]) {
    assert.ok(files.includes(expected), `${expected} should be selected`)
  }
  assert.ok(!files.includes('test/bundle.test.mjs'))
})

test('an entry module selects the full suite', () => {
  const all = selectAffectedTests({ all: true })
  for (const entry of ['index.js', 'client.js', 'reviewer.js', 'lib/tools/index.js']) {
    assert.deepEqual(selectAffectedTests({ paths: [entry] }), all, entry)
  }
})

test('a path with no importing test selects the full suite', () => {
  const all = selectAffectedTests({ all: true })
  assert.deepEqual(selectAffectedTests({ paths: ['README.md'] }), all)
})

test('a changed test file selects itself', () => {
  assert.deepEqual(selectAffectedTests({ paths: ['test/review-unit.test.mjs'] }), [
    'test/review-unit.test.mjs',
  ])
})

test('the selection is sorted and free of duplicates', () => {
  const files = selectAffectedTests({
    paths: ['test/review-unit.test.mjs', 'lib/review/brief.js', 'lib/review/brief.js'],
  })
  assert.deepEqual(files, ['test/review-doc.test.mjs', 'test/review-reviewer.test.mjs', 'test/review-seal.test.mjs', 'test/review-unit.test.mjs'])
})

test('--all ignores the working tree and returns the full suite', async () => {
  const all = selectAffectedTests({ all: true })
  const { value, lines } = await capture(() =>
    main(['--all', '--list'], { gitStatus: () => '' }),
  )
  assert.equal(value, 0)
  assert.deepEqual(lines, all)
})

test('an empty change set is an error, not a silent full run', async () => {
  let direct
  try {
    selectAffectedTests({ paths: [] })
  } catch (error) {
    direct = error
  }
  assert.ok(direct instanceof SelectorError)
  assert.equal(direct.exitCode, 2)
  assert.match(direct.message, /no changed path found/)
  await assert.rejects(main(['--list'], { gitStatus: () => '' }), (error) => {
    assert.ok(error instanceof SelectorError)
    assert.equal(error.exitCode, 2)
    assert.match(error.message, /no changed path found/)
    return true
  })
})

test('a deleted test file falls back to the full suite', () => {
  const all = selectAffectedTests({ all: true })
  assert.deepEqual(selectAffectedTests({ paths: ['test/removed.test.mjs'] }), all)
})

test('a rename entry uses its destination path', async () => {
  const { lines } = await capture(() =>
    main(['--list'], { gitStatus: () => 'R  old-name.js -> lib/review/brief.js\n' }),
  )
  assert.deepEqual(lines, ['test/review-doc.test.mjs', 'test/review-reviewer.test.mjs', 'test/review-seal.test.mjs', 'test/review-unit.test.mjs'])
})

test('the two entrypoints share one compile-cache path and the coverage branch drops it', () => {
  assert.equal(COMPILE_CACHE, join(ROOT, '.cache', 'node-compile'))
  assert.equal(testEnvFor(false).NODE_COMPILE_CACHE, COMPILE_CACHE)
  assert.equal(testEnvFor(true).NODE_COMPILE_CACHE, undefined)
})

test('a rejected runtime stops before any test starts', async () => {
  let spawned = false
  await assert.rejects(
    main(['--run', 'test/review-unit.test.mjs'], {
      version: 'v22.0.0',
      spawn: () => {
        spawned = true
        return { status: 0 }
      },
    }),
    /Node 24/,
  )
  assert.equal(spawned, false)
})

test('the scoped run forwards the shared plain-run environment', async () => {
  const calls = []
  const runRoot = '/scoped/run-root'
  const code = await main(['--run', 'test/review-unit.test.mjs'], {
    tmpDir: runRoot,
    spawn: (command, args, options) => {
      calls.push({ command, args, options })
      return { status: 1 }
    },
  })
  assert.equal(code, 1)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].args, ['--test', `--test-concurrency=${DEFAULT_CONCURRENCY}`, 'test/review-unit.test.mjs'])
  assert.equal(calls[0].options.cwd, ROOT)
  assert.equal(calls[0].options.env.NODE_COMPILE_CACHE, COMPILE_CACHE)
  assert.equal(calls[0].options.env.TMPDIR, runRoot)
})

test('--list wins over --run and starts no test process', async () => {
  let spawned = false
  const { value, lines } = await capture(() =>
    main(['--list', '--run', 'lib/review/brief.js'], {
      spawn: () => {
        spawned = true
        return { status: 0 }
      },
    }),
  )
  assert.equal(value, 0)
  assert.equal(spawned, false)
  assert.deepEqual(lines, ['test/review-doc.test.mjs', 'test/review-reviewer.test.mjs', 'test/review-seal.test.mjs', 'test/review-unit.test.mjs'])
})
