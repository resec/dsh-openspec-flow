import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PNPM_VERSION } from '../scripts/lab/core/doctor.mjs'

const WORKFLOW = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

// The workflow is read by indentation: a job is a two-space key under `jobs:`, a step is a
// `- ` item at six spaces under the job's `steps:`. Reading the jobs apart lets a test say
// which job runs a command and in which order, instead of searching the whole file.
function readJobs(text) {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line === 'jobs:')
  assert.ok(start >= 0, 'the workflow has no jobs section')
  const jobs = new Map()
  let name = null
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue
    const header = /^ {2}([A-Za-z0-9_-]+):$/.exec(line)
    if (header) {
      name = header[1]
      jobs.set(name, [])
      continue
    }
    assert.ok(name !== null, `the workflow has a line outside any job: ${line}`)
    jobs.get(name).push(line)
  }
  return jobs
}

function readSteps(lines, job) {
  const start = lines.findIndex((line) => line === '    steps:')
  assert.ok(start >= 0, `the ${job} job has no steps list`)
  const steps = []
  for (const line of lines.slice(start + 1)) {
    const marker = /^ {6}- (.*)$/.exec(line)
    if (marker) {
      steps.push(marker[1])
      continue
    }
    assert.ok(steps.length > 0, `the ${job} job has a line outside a step: ${line}`)
    steps[steps.length - 1] += `\n${line}`
  }
  return steps
}

const JOBS = readJobs(WORKFLOW)
const STEPS = new Map([...JOBS].map(([job, lines]) => [job, readSteps(lines, job)]))

function jobSteps(job) {
  const steps = STEPS.get(job)
  assert.ok(steps, `the workflow has no ${job} job`)
  return steps
}

function jobLines(job) {
  const lines = JOBS.get(job)
  assert.ok(lines, `the workflow has no ${job} job`)
  return lines
}

// Every step of every job that carries the needle.
function matches(needle) {
  const found = []
  for (const [job, steps] of STEPS) {
    steps.forEach((step, index) => {
      if (step.includes(needle)) found.push({ job, index, step })
    })
  }
  return found
}

// The needle must live in exactly one step of one job, so a step moved into the wrong job
// fails here instead of passing on a whole-file substring match.
function ownerOf(needle) {
  const found = matches(needle)
  assert.equal(found.length, 1, `${needle} must appear in exactly one step, found ${found.length}`)
  return found[0]
}

function stepOf(job, needle) {
  const found = matches(needle).filter((entry) => entry.job === job)
  assert.equal(found.length, 1, `the ${job} job must hold ${needle} in exactly one step`)
  return found[0]
}

function assertOrder(job, needles) {
  let lastIndex = -1
  let lastName = null
  for (const needle of needles) {
    const found = stepOf(job, needle)
    assert.ok(found.index > lastIndex, `the ${job} job must run ${needle} after ${lastName}`)
    lastIndex = found.index
    lastName = needle
  }
}

function attribute(job, key) {
  const prefix = `    ${key}:`
  const line = jobLines(job).find((entry) => entry.startsWith(prefix))
  assert.ok(line, `the ${job} job has no ${key}`)
  return line.slice(prefix.length).trim()
}

function capture(pattern, text) {
  const match = pattern.exec(text)
  assert.ok(match, `${pattern} does not match ${JSON.stringify(text)}`)
  return match[1]
}

test('CI is pull-request driven, read-only and Ubuntu-only', () => {
  assert.match(WORKFLOW, /^on:\n  pull_request:\n/m)
  const permissions = /^permissions:\n((?: {2}\S.*\n)+)/m.exec(WORKFLOW)
  assert.ok(permissions, 'the workflow declares no permissions block')
  assert.deepEqual(
    permissions[1].trim().split('\n').map((line) => line.trim()),
    ['contents: read'],
    'CI must grant contents: read and no other permission',
  )
  assert.doesNotMatch(WORKFLOW, /:\s*write$/m)
  assert.deepEqual([...JOBS.keys()].sort(), ['lab', 'verify'])
  for (const job of JOBS.keys()) {
    assert.equal(attribute(job, 'runs-on'), 'ubuntu-latest', `the ${job} job must run on ubuntu-latest`)
  }
  assert.doesNotMatch(WORKFLOW, /macos/i)
})

test('superseded CI runs are cancelled', () => {
  assert.match(
    WORKFLOW,
    /^concurrency:\n {2}group: ci-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: true$/m,
    'the workflow must cancel an in-progress run for the same ref',
  )
})

test('both jobs declare a bounded timeout', () => {
  assert.equal(attribute('verify', 'timeout-minutes'), '20', 'the verify job must keep its 20 minute budget')
  assert.equal(attribute('lab', 'timeout-minutes'), '30', 'the lab job must keep its 30 minute budget')
})

test('both jobs derive Node from the baseline file', () => {
  for (const job of ['verify', 'lab']) {
    const pin = stepOf(job, 'coverage.baseline.json')
    assert.match(pin.step, /^id: node-pin$/m, `the ${job} job must name the pin step`)
    assert.equal(
      matches('steps.node-pin.outputs.version').filter((entry) => entry.job === job).length,
      1,
      `the ${job} job must feed the pin into setup-node once`,
    )
    const setup = stepOf(job, 'node-version: ${{ steps.node-pin.outputs.version }}')
    assert.match(setup.step, /^uses: actions\/setup-node@v7$/m)
    assert.match(setup.step, /^\s*cache: npm$/m)
    assert.ok(setup.index > pin.index, `the ${job} job must pin Node before setup-node`)
    stepOf(job, 'uses: actions/checkout@v7')
  }
})

test('the verify job runs the change, skill and verification gates in order', () => {
  for (const command of [
    'scripts/check-pr-change.mjs',
    'check-generated-skills.mjs --base',
    'npm run openspec:check',
    'npm run check:requirement-length',
    'npm run verify',
  ]) {
    assert.equal(ownerOf(command).job, 'verify', `${command} must run in the verify job and nowhere else`)
  }
  assertOrder('verify', [
    'run: npm ci',
    'check-pr-change.mjs',
    'check-generated-skills.mjs --base',
    'npm run openspec:check',
    'npm run check:requirement-length',
    'npm run verify',
  ])
})

test('the lab job installs pnpm, the font and Chromium before the doctor and the lab', () => {
  for (const command of [
    'pnpm/action-setup@v6',
    'fonts-wqy-zenhei',
    'npx playwright install --with-deps chromium',
    'npm run lab -- doctor',
    'npm run test:lab -- --mock-only',
  ]) {
    assert.equal(ownerOf(command).job, 'lab', `${command} must run in the lab job and nowhere else`)
  }
  assertOrder('lab', [
    'pnpm/action-setup@v6',
    'run: npm ci',
    'fonts-wqy-zenhei',
    'npx playwright install --with-deps chromium',
    'npm run lab -- doctor',
    'npm run test:lab -- --mock-only',
  ])
  const font = stepOf('lab', 'fonts-wqy-zenhei')
  assert.match(font.step, /run: sudo apt-get update && sudo apt-get install -y fonts-wqy-zenhei/)
  assert.ok(
    font.index < stepOf('lab', 'npm run lab -- doctor').index,
    'the CJK font must be installed before the doctor checks for it',
  )
})

test('the lab job installs the browser where the doctor looks', () => {
  assert.ok(jobLines('lab').includes('    env:'), 'the lab job must declare env')
  assert.ok(
    jobLines('lab').includes('      PLAYWRIGHT_BROWSERS_PATH: .cache/lab/pw-browsers'),
    'the lab job must point PLAYWRIGHT_BROWSERS_PATH at .cache/lab/pw-browsers',
  )
  assert.ok(
    !jobLines('verify').some((line) => line.includes('PLAYWRIGHT_BROWSERS_PATH')),
    'the verify job must not set PLAYWRIGHT_BROWSERS_PATH',
  )
  const caches = matches('uses: actions/cache@v6').filter((entry) => entry.job === 'lab')
  assert.equal(caches.length, 2, 'the lab job must cache the browser and the DSH checkout')
  assert.deepEqual(
    caches.map((entry) => capture(/^\s*path: (\S+)$/m, entry.step)).sort(),
    ['.cache/lab/dsh', '.cache/lab/pw-browsers'],
  )
  assert.deepEqual(
    caches.map((entry) => capture(/hashFiles\('([^']+)'\)/, entry.step)).sort(),
    ['package-lock.json', 'package.json'],
  )
})

test('the change check compares the base with the pull-request head', () => {
  const { step } = stepOf('verify', 'name: change check')
  assert.match(step, /PR_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/u)
  assert.match(step, /PR_HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/u)
  assert.match(step, /check-pr-change\.mjs "\$\{arguments\[@\]\}"/u)
  const checkout = stepOf('verify', 'fetch-depth: 0')
  assert.match(checkout.step, /uses: actions\/checkout@v7/u)
  assert.ok(checkout.index < stepOf('verify', 'name: change check').index)
})

test('the change check grants the maintainer exemption only to a same-repository maintainer pull request', () => {
  const { step } = stepOf('verify', 'name: change check')
  assert.match(step, /PR_AUTHOR: \$\{\{ github\.event\.pull_request\.user\.login \}\}/u)
  assert.match(step, /PR_HEAD_REPO: \$\{\{ github\.event\.pull_request\.head\.repo\.full_name \}\}/u)
  assert.match(step, /REPOSITORY: \$\{\{ github\.repository \}\}/u)
  assert.match(step, /if \[ "\$PR_AUTHOR" = "resec" \] && \[ "\$PR_HEAD_REPO" = "\$REPOSITORY" \]; then/u)
  assert.match(step, /arguments\+=\(--maintainer\)/u)
  const run = step.slice(step.indexOf('run: |'))
  assert.doesNotMatch(run, /\$\{\{/u)
})

test('the lab job pins the repository npm cache before the lab commands', () => {
  const lab = WORKFLOW.slice(WORKFLOW.indexOf('\n  lab:\n'))
  const pin = lab.indexOf('OPENSPEC_FLOW_NPM_CACHE=$HOME/.npm')
  const doctor = lab.indexOf('npm run lab -- doctor')
  assert.ok(pin >= 0, 'the lab job does not pin the repository npm cache')
  assert.ok(doctor > pin, 'the cache pin must precede the lab commands')
})

test('the lab job provisions the pinned pnpm before npm ci', () => {
  const action = stepOf('lab', 'pnpm/action-setup@v6')
  const workflowPin = /pnpm\/action-setup@v6[\s\S]*?version:\s*(\S+)/.exec(action.step)
  assert.ok(workflowPin, 'the lab job does not pin a pnpm version')
  assert.ok(
    action.index < stepOf('lab', 'run: npm ci').index,
    'the lab job installs pnpm before npm ci',
  )
  assert.equal(
    workflowPin[1],
    PNPM_VERSION,
    `the workflow pins pnpm ${workflowPin[1]}, expected ${PNPM_VERSION}`,
  )

  const documentation = readFileSync(new URL('../docs/lab.md', import.meta.url), 'utf8')
  const documentedPin = /npm install --global pnpm@(\S+)/.exec(documentation)
  assert.ok(documentedPin, 'docs/lab.md does not carry the pnpm install command')
  assert.equal(
    documentedPin[1],
    PNPM_VERSION,
    `docs/lab.md pins pnpm ${documentedPin[1]}, expected ${PNPM_VERSION}`,
  )
})

test('npm ci runs once in each job', () => {
  assert.deepEqual(
    matches('run: npm ci').map((entry) => entry.job).sort(),
    ['lab', 'verify'],
    'each job must install the locked dependencies exactly once',
  )
  assert.equal(jobSteps('verify').length, 9, 'the verify job must keep its nine steps')
  assert.equal(jobSteps('lab').length, 11, 'the lab job must keep its eleven steps')
})

test('every action reference uses the Node 24 major', () => {
  const allowed = new Set([
    'actions/checkout@v7',
    'actions/setup-node@v7',
    'actions/cache@v6',
    'pnpm/action-setup@v6',
  ])
  const references = [...WORKFLOW.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1])
  assert.equal(references.length, 7, 'the workflow has seven uses references')
  for (const reference of references) {
    assert.ok(allowed.has(reference), `${reference} is not an allowlisted Node 24 action reference`)
  }
  const byJob = new Map([...STEPS].map(([job, steps]) => [
    job,
    steps.flatMap((step) => [...step.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1])),
  ]))
  assert.deepEqual(byJob.get('verify').sort(), ['actions/checkout@v7', 'actions/setup-node@v7'])
  assert.deepEqual(byJob.get('lab').sort(), [
    'actions/cache@v6',
    'actions/cache@v6',
    'actions/checkout@v7',
    'actions/setup-node@v7',
    'pnpm/action-setup@v6',
  ])
})
