import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  aggregateScope,
  deltaViolations,
  floorViolations,
  newCodeMisses,
  newCodeTotals,
  mergeUntrackedFiles,
  newCodeViolations,
  parseLcov,
  parseUnifiedDiff,
  percentage,
  resolveBase,
  resolveMode,
  runGate,
  shouldRecordStamp,
  validateBaselineNode,
  writeBaseline,
} from '../scripts/coverage-gate.mjs'
import { runVerification } from '../scripts/coverage.mjs'
import { readStamp as readStampFixture, writeStamp as writeStampFixture } from '../scripts/coverage-stamp.mjs'

const isSource = (file) => file === 'lib/a.js'

function metrics(lineHits = 90, branchHits = 85, functionHits = 95) {
  return {
    line: { hits: lineHits, total: 100 },
    branch: { hits: branchHits, total: 100 },
    function: { hits: functionHits, total: 100 },
  }
}

function lcovText() {
  return [
    'SF:lib/a.js',
    'FN:1,execute',
    'FN:5,execute',
    'FNDA:1,execute',
    'FNDA:0,execute',
    'DA:1,1',
    'DA:2,1',
    'DA:3,0',
    'BRDA:1,0,0,1',
    'BRDA:2,0,1,0',
    'BRDA:2,0,2,-',
    'FNF:2',
    'FNH:1',
    'end_of_record',
  ].join('\n')
}

test('parses lcov without collapsing duplicate function names', () => {
  const files = parseLcov(lcovText())
  const record = files.get('lib/a.js')
  assert.equal(record.lines.size, 3)
  assert.equal(record.branches.length, 3)
  assert.equal(record.functions.length, 2)
  assert.deepEqual(record.functions.map((entry) => entry.hit), [1, 0])
})

test('aggregates line, branch, and function totals', () => {
  const totals = aggregateScope(parseLcov(lcovText()), isSource)
  assert.deepEqual(totals, {
    line: { hits: 2, total: 3 },
    branch: { hits: 1, total: 3 },
    function: { hits: 1, total: 2 },
  })
})

test('computes new-code totals for a line set and a fully new file', () => {
  const files = parseLcov(lcovText())
  const partial = newCodeTotals(files, new Map([['lib/a.js', new Set([2, 3])]]), isSource)
  assert.deepEqual(partial, {
    line: { hits: 1, total: 2 },
    branch: { hits: 0, total: 2 },
    function: { hits: 0, total: 0 },
  })
  const whole = newCodeTotals(files, new Map([['lib/a.js', null]]), isSource)
  assert.deepEqual(whole, {
    line: { hits: 2, total: 3 },
    branch: { hits: 1, total: 3 },
    function: { hits: 1, total: 2 },
  })
})

test('parses added lines from unified zero-context hunks', () => {
  const diff = [
    'diff --git a/lib/a.js b/lib/a.js',
    '--- a/lib/a.js',
    '+++ b/lib/a.js',
    '@@ -1,0 +2,2 @@',
    '+one',
    '+two',
    '@@ -5,1 +7,0 @@',
    '-old',
    '@@ -9,1 +9,1 @@',
    '-before',
    '+after',
    'diff --git a/lib/new.js b/lib/new.js',
    '--- /dev/null',
    '+++ b/lib/new.js',
    '@@ -0,0 +1,2 @@',
    '+first',
    '+second',
    '',
  ].join('\n')
  const added = parseUnifiedDiff(diff)
  assert.deepEqual([...added.get('lib/a.js')], [2, 3, 9])
  assert.deepEqual([...added.get('lib/new.js')], [1, 2])
})

test('maps a rename to its new path', () => {
  const diff = [
    'diff --git a/lib/old.js b/lib/new.js',
    'similarity index 80%',
    'rename from lib/old.js',
    'rename to lib/new.js',
    '--- a/lib/old.js',
    '+++ b/lib/new.js',
    '@@ -1,1 +1,2 @@',
    '-old',
    '+new',
    '+extra',
    '',
  ].join('\n')
  assert.deepEqual([...parseUnifiedDiff(diff).get('lib/new.js')], [1, 2])
})

test('marks untracked source files as fully new and skips other files', () => {
  const added = new Map()
  mergeUntrackedFiles(added, ['lib/new.js', 'test/new.test.mjs', 'README.md'], (file) => file.startsWith('lib/'))
  assert.equal(added.get('lib/new.js'), null)
  assert.equal(added.has('test/new.test.mjs'), false)
  assert.equal(added.has('README.md'), false)
})

test('lists uncovered new-code locations', () => {
  const files = parseLcov(lcovText())
  const misses = newCodeMisses(files, new Map([['lib/a.js', new Set([2, 3])]]), isSource)
  assert.deepEqual(misses.sort(), [
    'lib/a.js:2 branch',
    'lib/a.js:2 branch',
    'lib/a.js:3 line',
  ])
})

test('checks exact floor boundaries', () => {
  assert.deepEqual(floorViolations('plugin', metrics(90, 85, 95), { line: 90, branch: 85, function: 95 }), [])
  const violations = floorViolations('plugin', metrics(89, 84, 94), { line: 90, branch: 85, function: 95 })
  assert.equal(violations.length, 3)
  assert.match(violations[0], /plugin line 89\.00% < 90\.00%/)
})

test('requires every new function to be called', () => {
  assert.deepEqual(
    newCodeViolations('plugin', metrics(100, 100, 100), { line: 95, branch: 90, function: 100 }),
    [],
  )
  const violations = newCodeViolations('plugin', metrics(100, 100, 99), { line: 95, branch: 90, function: 100 })
  assert.equal(violations.length, 1)
  assert.match(violations[0], /new-code function 99\.00% < 100\.00%/)
})

test('allows an exact one-point delta and rejects a larger drop', () => {
  const baseline = metrics(90, 85, 95)
  assert.deepEqual(deltaViolations('plugin', metrics(89, 85, 95), baseline, 1), [])
  assert.equal(deltaViolations('plugin', metrics(88, 85, 95), baseline, 1).length, 1)
  assert.equal(
    deltaViolations(
      'plugin',
      { line: { hits: 889, total: 1000 }, branch: { hits: 85, total: 100 }, function: { hits: 95, total: 100 } },
      { line: { hits: 900, total: 1000 }, branch: { hits: 85, total: 100 }, function: { hits: 95, total: 100 } },
      1,
    ).length,
    1,
  )
})

test('computes percentages and null for an empty metric', () => {
  assert.equal(percentage({ hits: 1, total: 2 }), 50)
  assert.equal(percentage({ hits: 0, total: 0 }), null)
})

test('validates the baseline Node major and range', () => {
  const requirements = { primaryMajor: 24, range: '>=24.9.0' }
  assert.doesNotThrow(() => validateBaselineNode({ node: { version: 'v24.22.2', range: '>=24.9.0' } }, requirements))
  assert.doesNotThrow(() => validateBaselineNode({ node: { version: 'v24.9.0', range: '>=24.9.0' } }, requirements))
  assert.throws(
    () => validateBaselineNode({ node: { version: 'v26.12.0', range: '>=24.9.0' } }, requirements),
    /primary major 24/,
  )
  assert.throws(
    () => validateBaselineNode({ node: { version: 'v24.8.9', range: '>=24.9.0' } }, requirements),
    /does not satisfy engines\.node/,
  )
  assert.throws(() => validateBaselineNode({}, requirements), /node\.version/)
})

test('ratchets the baseline and requires an explicit lower override', () => {
  const root = mkdtempSync(join(tmpdir(), 'coverage-gate-'))
  try {
    const requirements = { primaryMajor: 24, range: '>=24.9.0' }
    writeFileSync(
      join(root, 'coverage.baseline.json'),
      JSON.stringify({
        version: 1,
        node: { version: 'v24.22.2', range: '>=24.9.0' },
        scopes: { plugin: metrics(90) },
      }),
    )
    assert.throws(
      () => writeBaseline(root, { plugin: metrics(80) }, requirements, { allowLower: false, reason: null }),
      /would drop/,
    )
    const raised = writeBaseline(root, { plugin: metrics(95) }, requirements, { allowLower: false, reason: null })
    assert.equal(raised.scopes.plugin.line.hits, 95)
    const lowered = writeBaseline(
      root,
      { plugin: metrics(80) },
      requirements,
      { allowLower: true, reason: 'removed covered code' },
    )
    assert.equal(lowered.reason, 'removed covered code')
    assert.equal(JSON.parse(readFileSync(join(root, 'coverage.baseline.json'), 'utf8')).scopes.plugin.line.hits, 80)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result
}

function lcov(source, lines, branches = [], functions = []) {
  const records = [`SF:${source}`]
  for (const [line, count] of lines) records.push(`DA:${line},${count}`)
  for (const [line, block, branch, taken] of branches) records.push(`BRDA:${line},${block},${branch},${taken}`)
  for (const [name, line, hit] of functions) {
    records.push(`FN:${line},${name}`)
    records.push(`FNDA:${hit},${name}`)
  }
  records.push('end_of_record')
  return `${records.join('\n')}\n`
}

test('rejects an instrumented run with no lcov', async () => {
  const root = mkdtempSync(join(tmpdir(), 'coverage-empty-'))
  try {
    writeJson(join(root, 'coverage.config.json'), {
      primaryNodeMajor: 24,
      mode: 'report',
      thresholds: {
        absolute: { line: 90, branch: 85, function: 95 },
        deltaMaxDrop: 1,
        newCode: { line: 95, branch: 90, function: 100 },
      },
    })
    writeJson(join(root, 'package.json'), { engines: { node: '>=24.9.0' } })
    await assert.rejects(runGate({ root }), /missing lcov for plugin/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('report mode exits zero and enforce mode exits one for the same run', async () => {
  const root = mkdtempSync(join(tmpdir(), 'coverage-modes-'))
  try {
    git(root, ['init', '-b', 'main'])
    git(root, ['config', 'user.email', 'test@example.com'])
    git(root, ['config', 'user.name', 'Test'])
    mkdirSync(join(root, 'lib'), { recursive: true })
    writeFileSync(join(root, 'index.js'), 'export const a = 1\n')
    writeFileSync(join(root, 'lib', 'a.js'), 'export const b = 2\n')
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ engines: { node: '>=24.9.0' } }, null, 2),
    )
    writeFileSync(
      join(root, 'coverage.config.json'),
      JSON.stringify({
        primaryNodeMajor: 24,
        mode: 'report',
        thresholds: {
          absolute: { line: 90, branch: 85, function: 95 },
          deltaMaxDrop: 1,
          newCode: { line: 95, branch: 90, function: 100 },
        },
      }, null, 2),
    )
    writeJson(join(root, 'coverage.baseline.json'), {
      version: 1,
      node: { version: process.version, range: '>=24.9.0' },
      scopes: {
        plugin: {
          line: { hits: 0, total: 0 },
          branch: { hits: 0, total: 0 },
          function: { hits: 0, total: 0 },
        },
      },
    })
    mkdirSync(join(root, '.coverage'), { recursive: true })
    writeFileSync(
      join(root, '.coverage', 'plugin.info'),
      lcov('index.js', [[1, 1]], [[1, 0, 0, 1]], [['a', 1, 1]]) +
        lcov('lib/a.js', [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0]], [], []),
    )
    git(root, ['add', '-A'])
    git(root, ['commit', '-m', 'base'])

    assert.equal(await runGate({ root, mode: 'report', base: 'main' }), 0)
    assert.equal(await runGate({ root, mode: 'enforce', base: 'main' }), 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

function makePassingGateRepo() {
  const root = mkdtempSync(join(tmpdir(), 'coverage-pass-'))
  git(root, ['init', '-b', 'main'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test'])
  writeFileSync(join(root, 'index.js'), 'export const a = 1\n')
  writeFileSync(join(root, '.gitignore'), '.cache/\n')
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3}\n')
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(join(root, 'lib', 'a.js'), 'export const b = 2\n')
  mkdirSync(join(root, 'test'), { recursive: true })
  writeFileSync(join(root, 'test', 'fixture.test.mjs'), "import test from 'node:test'\n")
  mkdirSync(join(root, 'scripts'), { recursive: true })
  for (const name of ['coverage.mjs', 'coverage-gate.mjs', 'coverage-stamp.mjs', 'run-tests.mjs', 'test-env.mjs', 'node-version.mjs']) {
    writeFileSync(join(root, 'scripts', name), '// fixture\n')
  }
  writeJson(join(root, 'package.json'), { engines: { node: '>=24.9.0' } })
  writeJson(join(root, 'coverage.config.json'), {
    primaryNodeMajor: 24,
    mode: 'enforce',
    thresholds: {
      absolute: { line: 90, branch: 85, function: 95 },
      deltaMaxDrop: 1,
      newCode: { line: 95, branch: 90, function: 100 },
    },
  })
  writeJson(join(root, 'coverage.baseline.json'), {
    version: 1,
    node: { version: process.version, range: '>=24.9.0' },
    scopes: {
      plugin: {
        line: { hits: 0, total: 0 },
        branch: { hits: 0, total: 0 },
        function: { hits: 0, total: 0 },
      },
    },
  })
  mkdirSync(join(root, '.coverage'), { recursive: true })
  writeFileSync(
    join(root, '.coverage', 'plugin.info'),
    lcov('index.js', [[1, 1]], [[1, 0, 0, 1]], [['a', 1, 1]]) + lcov('lib/a.js', [[1, 1]], [[1, 0, 0, 1]], [['b', 1, 1]]),
  )
  git(root, ['add', '-A'])
  git(root, ['commit', '-m', 'passing'])
  return root
}

test('the stamp predicate is true only for a clean enforce pass', () => {
  const base = { mode: 'enforce', updateBaseline: false, code: 0, violations: [] }
  assert.equal(shouldRecordStamp(base), true)
  assert.equal(shouldRecordStamp({ ...base, mode: 'report' }), false)
  assert.equal(shouldRecordStamp({ ...base, updateBaseline: true }), false)
  assert.equal(shouldRecordStamp({ ...base, code: 1 }), false)
  assert.equal(shouldRecordStamp({ ...base, violations: ['plugin line 89% < 90%'] }), false)
})

test('resolveMode prefers the request, falls back to the config and rejects an unknown mode', () => {
  const root = mkdtempSync(join(tmpdir(), 'coverage-mode-'))
  try {
    writeJson(join(root, 'coverage.config.json'), { mode: 'report' })
    writeJson(join(root, 'package.json'), { engines: { node: '>=24.9.0' } })
    assert.equal(resolveMode(root, 'enforce'), 'enforce')
    assert.equal(resolveMode(root, undefined), 'report')
    assert.throws(() => resolveMode(root, 'audit'), /unknown coverage mode/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a passing enforce run reports the resolved base to onEnforcePass', async () => {
  const root = makePassingGateRepo()
  try {
    const head = git(root, ['rev-parse', 'HEAD']).stdout.trim()
    const passed = []
    const failed = []
    const code = await runGate({
      root,
      mode: 'enforce',
      base: 'main',
      onEnforcePass: (payload) => passed.push(payload),
      onEnforceFail: (payload) => failed.push(payload),
    })
    assert.equal(code, 0)
    assert.equal(passed.length, 1)
    assert.equal(passed[0].base, head)
    assert.equal(failed.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a violating enforce run reports to onEnforceFail and not onEnforcePass', async () => {
  const root = makePassingGateRepo()
  try {
    writeFileSync(join(root, 'lib', 'a.js'), 'export const b = 2\nexport const c = 3\n')
    mkdirSync(join(root, '.coverage'), { recursive: true })
    writeFileSync(
      join(root, '.coverage', 'plugin.info'),
      lcov('index.js', [[1, 1]], [[1, 0, 0, 1]], [['a', 1, 1]]) + lcov('lib/a.js', [[1, 1], [2, 0]], [], []),
    )
    git(root, ['add', '-A'])
    git(root, ['commit', '-m', 'violating'])
    const passed = []
    const failed = []
    const code = await runGate({
      root,
      mode: 'enforce',
      base: 'main',
      onEnforcePass: (payload) => passed.push(payload),
      onEnforceFail: (payload) => failed.push(payload),
    })
    assert.equal(code, 1)
    assert.equal(passed.length, 0)
    assert.equal(failed.length, 1)
    assert.ok(failed[0].violations.length > 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an update-baseline run returns zero and fires neither callback', async () => {
  const root = makePassingGateRepo()
  try {
    writeFileSync(join(root, 'lib', 'a.js'), 'export const b = 2\nexport const c = 3\n')
    writeFileSync(
      join(root, '.coverage', 'plugin.info'),
      lcov('index.js', [[1, 1]], [[1, 0, 0, 1]], [['a', 1, 1]]) + lcov('lib/a.js', [[1, 1], [2, 0]], [], []),
    )
    git(root, ['add', '-A'])
    git(root, ['commit', '-m', 'violating'])
    const passed = []
    const failed = []
    const code = await runGate({
      root,
      mode: 'enforce',
      base: 'main',
      updateBaseline: true,
      onEnforcePass: (payload) => passed.push(payload),
      onEnforceFail: (payload) => failed.push(payload),
    })
    assert.equal(code, 0)
    assert.equal(passed.length, 0)
    assert.equal(failed.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a preflight or argument failure leaves the recorded stamp untouched', async () => {
  const root = makePassingGateRepo()
  try {
    writeJson(join(root, '.gitignore'), '.cache/\n')
    writeFileSync(join(root, 'test-placeholder'), '')
    git(root, ['add', '-A'])
    git(root, ['commit', '-m', 'add ignore'])
    const base = resolveBase(root, 'main')
    writeStampFixture({ root, base })
    assert.ok(readStampFixture(root) !== null)
    await assert.rejects(runVerification({ root, argv: ['--bogus'] }), /unknown argument/)
    assert.ok(readStampFixture(root) !== null, 'an argument failure must not clear the stamp')
    await assert.rejects(runVerification({ root, argv: [], version: 'v22.0.0' }), /requires Node 24/)
    assert.ok(readStampFixture(root) !== null, 'a preflight failure must not clear the stamp')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('report mode does not pass without a usable baseline', async () => {
  const root = mkdtempSync(join(tmpdir(), 'coverage-report-baseline-'))
  try {
    git(root, ['init', '-b', 'main'])
    git(root, ['config', 'user.email', 'test@example.com'])
    git(root, ['config', 'user.name', 'Test'])
    mkdirSync(join(root, 'lib'), { recursive: true })
    writeFileSync(join(root, 'index.js'), 'export const a = 1\n')
    writeFileSync(join(root, 'lib', 'a.js'), 'export const b = 2\n')
    writeFileSync(join(root, 'package.json'), JSON.stringify({ engines: { node: '>=24.9.0' } }, null, 2))
    writeFileSync(join(root, 'coverage.config.json'), JSON.stringify({
      primaryNodeMajor: 24,
      mode: 'report',
      thresholds: {
        absolute: { line: 90, branch: 85, function: 95 },
        deltaMaxDrop: 1,
        newCode: { line: 95, branch: 90, function: 100 },
      },
    }, null, 2))
    mkdirSync(join(root, '.coverage'), { recursive: true })
    writeFileSync(join(root, '.coverage', 'plugin.info'), lcov('index.js', [[1, 1]], [[1, 0, 0, 1]], [['a', 1, 1]]))
    git(root, ['add', '-A'])
    git(root, ['commit', '-m', 'base'])

    await assert.rejects(runGate({ root, mode: 'report', base: 'main' }), /coverage\.baseline\.json is missing/u, 'a missing baseline fails the report mode')

    writeJson(join(root, 'coverage.baseline.json'), {
      version: 1,
      node: { version: 'v26.0.0', range: '>=24.9.0' },
      scopes: {},
    })
    await assert.rejects(runGate({ root, mode: 'report', base: 'main' }), /baseline/u, 'an unusable baseline fails the report mode')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
