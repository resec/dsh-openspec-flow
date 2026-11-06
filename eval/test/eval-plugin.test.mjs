import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  assertCommitReachable,
  clonePlugin,
  describePlugin,
  isPluginRoot,
  resolvePluginRoot,
} from '../lib/plugin.mjs'

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Eval Plugin Test',
  GIT_AUTHOR_EMAIL: 'eval@example.invalid',
  GIT_COMMITTER_NAME: 'Eval Plugin Test',
  GIT_COMMITTER_EMAIL: 'eval@example.invalid',
}

function tempRoot(t, prefix = 'eval-plugin-') {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

function pluginRoot(t, version = '0.1.0') {
  const directory = tempRoot(t)
  writeFileSync(
    join(directory, 'package.json'),
    `${JSON.stringify({ name: 'dsh-openspec-flow', version })}\n`,
  )
  return directory
}

function otherRoot(t) {
  const directory = tempRoot(t)
  writeFileSync(join(directory, 'package.json'), `${JSON.stringify({ name: 'other-package' })}\n`)
  return directory
}

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function gitPluginRoot(t) {
  const directory = pluginRoot(t, '9.9.9')
  runGit(directory, ['init', '-b', 'main'])
  runGit(directory, ['add', '-A'])
  runGit(directory, ['-c', 'user.name=Eval', '-c', 'user.email=eval@example.invalid', 'commit', '-m', 'base'])
  return directory
}

test('explicit plugin root wins over environment, sibling and repository', (t) => {
  const explicit = pluginRoot(t, '1.0.0')
  const environment = pluginRoot(t, '2.0.0')
  const sibling = pluginRoot(t, '3.0.0')

  const resolved = resolvePluginRoot({
    explicit,
    env: environment,
    siblingRoots: [sibling],
    currentRoot: sibling,
  })

  assert.equal(resolved.root, explicit)
  assert.equal(resolved.source, 'flag')
})

test('environment wins when no explicit root is given', (t) => {
  const environment = pluginRoot(t, '2.0.0')
  const sibling = pluginRoot(t, '3.0.0')

  const resolved = resolvePluginRoot({
    explicit: null,
    env: environment,
    siblingRoots: [sibling],
    currentRoot: sibling,
  })

  assert.equal(resolved.root, environment)
  assert.equal(resolved.source, 'environment')
})

test('sibling checkout wins over the current repository root', (t) => {
  const sibling = pluginRoot(t, '3.0.0')
  const current = pluginRoot(t, '4.0.0')
  const missing = join(tempRoot(t, 'eval-plugin-missing-'), 'absent')

  const resolved = resolvePluginRoot({
    explicit: null,
    env: '',
    siblingRoots: [missing, sibling],
    currentRoot: current,
  })

  assert.equal(resolved.root, sibling)
  assert.equal(resolved.source, 'sibling')
})

test('the current repository root is the single-repository fallback', (t) => {
  const current = pluginRoot(t, '4.0.0')
  const missing = join(tempRoot(t, 'eval-plugin-missing-'), 'absent')

  const resolved = resolvePluginRoot({
    explicit: null,
    env: '',
    siblingRoots: [missing],
    currentRoot: current,
  })

  assert.equal(resolved.root, current)
  assert.equal(resolved.source, 'repository')
})

test('an explicit root that is not the plugin fails loudly', (t) => {
  const other = otherRoot(t)

  assert.throws(
    () => resolvePluginRoot({ explicit: other, env: '', siblingRoots: [], currentRoot: other }),
    /--plugin-root plugin root is not dsh-openspec-flow/u,
  )
})

test('a missing explicit root is reported', () => {
  const missing = join(tmpdir(), 'eval-plugin-never-created')

  assert.throws(
    () => resolvePluginRoot({ explicit: missing, env: '', siblingRoots: [], currentRoot: missing }),
    /plugin root not found/u,
  )
})

test('unresolvable candidates list every attempted path', (t) => {
  const other = otherRoot(t)

  assert.throws(
    () => resolvePluginRoot({ explicit: null, env: '', siblingRoots: [other], currentRoot: other }),
    /cannot resolve the dsh-openspec-flow root; tried/u,
  )
})

test('isPluginRoot checks the package name', (t) => {
  assert.equal(isPluginRoot(pluginRoot(t)), true)
  assert.equal(isPluginRoot(otherRoot(t)), false)
  assert.equal(isPluginRoot(join(tmpdir(), 'eval-plugin-absent')), false)
})

test('describePlugin reports version and leaves git fields empty outside a checkout', (t) => {
  const root = pluginRoot(t, '0.1.0')

  const description = describePlugin(root)

  assert.equal(description.name, 'dsh-openspec-flow')
  assert.equal(description.version, '0.1.0')
  assert.equal(description.commit, null)
  assert.equal(description.dirty, null)
})

test('describePlugin reports the commit and dirty state of a checkout', (t) => {
  const root = gitPluginRoot(t)

  const clean = describePlugin(root)
  assert.match(clean.commit, /^[0-9a-f]{7,}$/u)
  assert.equal(clean.dirty, false)

  mkdirSync(join(root, 'scratch'), { recursive: true })
  writeFileSync(join(root, 'scratch', 'file.txt'), 'uncommitted\n')

  assert.equal(describePlugin(root).dirty, true)
})

test('assertCommitReachable accepts HEAD and rejects an unknown commit', (t) => {
  const root = gitPluginRoot(t)
  const head = runGit(root, ['rev-parse', 'HEAD'])

  assert.doesNotThrow(() => assertCommitReachable(root, head))
  assert.throws(
    () => assertCommitReachable(root, '0'.repeat(40)),
    /fixture base commit 0{40} is not reachable/u,
  )
})

function cloneResult({ calls, checkoutStatus = 0, fallbackStatus = 0 }) {
  return (command, args) => {
    calls.push([command, ...args])
    if (args[0] === 'clone') {
      const destination = args[2]
      mkdirSync(join(destination, '.git'), { recursive: true })
      writeFileSync(
        join(destination, 'package.json'),
        `${JSON.stringify({ name: 'dsh-openspec-flow', version: '0.1.0' })}\n`,
      )
      return { status: 0, stdout: '', stderr: '' }
    }
    if (args.includes('checkout')) {
      const status = args.includes('-B') ? fallbackStatus : checkoutStatus
      return { status, stdout: '', stderr: 'checkout failed' }
    }
    return { status: 0, stdout: '', stderr: '' }
  }
}

test('clonePlugin clones a missing destination and checks out the ref', (t) => {
  const destination = join(tempRoot(t, 'eval-plugin-clone-'), 'plugin')
  const calls = []

  const result = clonePlugin({
    url: 'git@example.invalid:plugin.git',
    ref: 'main',
    destination,
    run: cloneResult({ calls }),
  })

  assert.equal(result.root, destination)
  assert.equal(result.cloned, true)
  assert.deepEqual(calls[0], ['git', 'clone', 'git@example.invalid:plugin.git', destination])
  assert.ok(calls.some((call) => call.includes('fetch')))
  assert.ok(calls.some((call) => call.includes('checkout')))
  assert.ok(calls.every((call) => call[0] === 'git'))
})

test('clonePlugin reuses an existing checkout without cloning', (t) => {
  const destination = tempRoot(t, 'eval-plugin-clone-')
  mkdirSync(join(destination, '.git'), { recursive: true })
  writeFileSync(
    join(destination, 'package.json'),
    `${JSON.stringify({ name: 'dsh-openspec-flow', version: '0.1.0' })}\n`,
  )
  const calls = []

  const result = clonePlugin({ destination, run: cloneResult({ calls }) })

  assert.equal(result.cloned, false)
  assert.equal(result.root, destination)
  assert.ok(calls.every((call) => call[1] !== 'clone'))
  assert.ok(calls.some((call) => call.includes('fetch')))
})

test('clonePlugin fails when the requested ref cannot be checked out', (t) => {
  const destination = join(tempRoot(t, 'eval-plugin-clone-'), 'plugin')

  assert.throws(
    () =>
      clonePlugin({
        destination,
        run: cloneResult({ calls: [], checkoutStatus: 1, fallbackStatus: 1 }),
      }),
    /checkout/u,
  )
})

test('clonePlugin refuses to reuse a non-git directory', (t) => {
  const destination = tempRoot(t, 'eval-plugin-clone-')

  assert.throws(
    () => clonePlugin({ destination, run: cloneResult({ calls: [] }) }),
    /refusing to clone into a non-git directory/u,
  )
})

test('isPluginRoot tolerates a malformed package manifest', (t) => {
  const directory = tempRoot(t)
  writeFileSync(join(directory, 'package.json'), '{not json\n')

  assert.equal(isPluginRoot(directory), false)
})

test('an invalid EVAL_PLUGIN_ROOT fails loudly', (t) => {
  const other = otherRoot(t)

  assert.throws(
    () => resolvePluginRoot({ explicit: null, env: other }),
    /EVAL_PLUGIN_ROOT plugin root is not dsh-openspec-flow/u,
  )
})

test('a missing EVAL_PLUGIN_ROOT is reported', () => {
  const missing = join(tmpdir(), 'eval-plugin-env-never-created')

  assert.throws(
    () => resolvePluginRoot({ explicit: null, env: missing }),
    /plugin root not found/u,
  )
})

test('describePlugin rejects a directory that is not the plugin', (t) => {
  const other = otherRoot(t)

  assert.throws(() => describePlugin(other), /plugin root is not dsh-openspec-flow/u)
})

test('clonePlugin reports a failed clone command', (t) => {
  const destination = join(tempRoot(t, 'eval-plugin-clone-'), 'plugin')
  const run = () => ({ status: 1, stdout: '', stderr: 'boom' })

  assert.throws(
    () => clonePlugin({ destination, run }),
    /git clone .* failed: boom/u,
  )
})

test('describePlugin treats an empty HEAD as no commit', (t) => {
  const root = pluginRoot(t)
  const run = () => ({ status: 0, stdout: '', stderr: '' })

  const description = describePlugin(root, { run })

  assert.equal(description.commit, null)
  assert.equal(description.dirty, false)
})

test('describePlugin propagates a git execution error', (t) => {
  const root = pluginRoot(t)

  assert.throws(
    () => describePlugin(root, { run: () => ({ error: new Error('git missing') }) }),
    /git missing/u,
  )
})

test('clonePlugin propagates a command execution error', (t) => {
  const destination = join(tempRoot(t, 'eval-plugin-clone-'), 'plugin')
  const run = () => ({ error: new Error('spawn failed') })

  assert.throws(() => clonePlugin({ destination, run }), /spawn failed/u)
})
