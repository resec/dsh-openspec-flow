import assert from 'node:assert/strict'
import {
  existsSync,
  utimesSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  assetName,
  assetUrl,
  globalCandidateRoots,
  normalizeVersion,
  parseBaselineNodeVersion,
  parseShasum,
  readBaselineNodeVersion,
  selectNodeCandidate,
  shasumsUrl,
} from '../scripts/bootstrap-lib.mjs'
import {
  acquireInstallLockSync,
  installLockPath,
  releaseInstallLock,
  resolveEnvironment,
} from '../scripts/worktree-env.mjs'
import {
  browsersPath,
  completionHint,
  chromiumRecordFields,
  collectBuckets,
  dependenciesError,
  ensurePnpmBucket,
  npmEnvFor,
  parseBootstrapArgs,
  playwrightEnv,
  resolveNpmCache,
  resolvePlan,
  runBrowserStep,
  writeToolchainRecord,
} from '../scripts/bootstrap.mjs'
import { PNPM_VERSION, buildRecord, pnpmBucket, readRecord, writeRecord } from '../scripts/toolchain.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASELINE = JSON.parse(readFileSync(join(ROOT, 'coverage.baseline.json'), 'utf8')).node.version.replace(/^v/, '')

test('the shell and Node resolve the same shared root', () => {
  const script = join(ROOT, 'scripts', 'bootstrap.sh')
  const override = mkdtempSync(join(tmpdir(), 'bootstrap-shared-'))
  const withOverride = spawnSync('sh', [script, '--print-shared-root'], {
    encoding: 'utf8',
    env: { ...process.env, OPENSPEC_FLOW_SHARED_ROOT: override },
  })
  assert.equal(withOverride.status, 0)
  assert.equal(withOverride.stdout.trim(), override)
  const shellDefault = spawnSync('sh', [script, '--print-shared-root'], {
    encoding: 'utf8',
    env: { ...process.env, OPENSPEC_FLOW_SHARED_ROOT: '' },
  })
  assert.equal(shellDefault.status, 0)
  const nodeDefault = resolveEnvironment({ cwd: ROOT, env: { ...process.env, OPENSPEC_FLOW_SHARED_ROOT: '' } })
  assert.equal(shellDefault.stdout.trim(), nodeDefault.sharedRoot)
  rmSync(override, { recursive: true, force: true })
})

test('reuses a prepared downloaded Node bucket before looking at the host', () => {
  const shared = mkdtempSync(join(tmpdir(), 'bootstrap-bucket-'))
  const home = mkdtempSync(join(tmpdir(), 'bootstrap-home-'))
  const bucket = join(shared, 'toolchain', 'node', BASELINE)
  mkdirSync(join(bucket, 'bin'), { recursive: true })
  const marker = join(shared, 'ran.txt')
  writeFileSync(join(bucket, 'bin', 'node'), `#!/bin/sh\nprintf '%s\\n' \"$@\" > ${JSON.stringify(marker)}\nexit 0\n`)
  spawnSync('chmod', ['+x', join(bucket, 'bin', 'node')])
  writeFileSync(join(bucket, '.complete'), `${BASELINE}\n`)
  const result = spawnSync('sh', [join(ROOT, 'scripts', 'bootstrap.sh')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      PATH: '/usr/bin:/bin',
      OPENSPEC_FLOW_SHARED_ROOT: shared,
      OPENSPEC_FLOW_NODE_SOURCE: '',
    },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.ok(existsSync(marker))
  rmSync(shared, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
})

test('activation prefers the recorded Node and falls back to the legacy runtime', () => {
  const root = mkdtempSync(join(tmpdir(), 'bootstrap-activate-'))
  const recordDir = join(root, '.cache', 'toolchain')
  const bin = join(root, 'bin')
  mkdirSync(recordDir, { recursive: true })
  mkdirSync(bin, { recursive: true })
  const node = join(bin, 'node')
  writeFileSync(node, '#!/bin/sh\nexit 0\n')
  spawnSync('chmod', ['+x', node])
  writeFileSync(join(recordDir, 'manifest.json'), JSON.stringify({ node: { path: node } }))
  const result = spawnSync('sh', ['-c', `. ${JSON.stringify(join(ROOT, 'scripts', 'activate.sh'))}; command -v node`], {
    encoding: 'utf8',
    env: { ...process.env, OPENSPEC_FLOW_WORKTREE_ROOT: root, PATH: '/usr/bin:/bin' },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), node)
  rmSync(root, { recursive: true, force: true })
})

test('prepares or reuses the pnpm bucket', () => {
  const shared = mkdtempSync(join(tmpdir(), 'bootstrap-pnpm-'))
  const bucket = pnpmBucket(shared)
  mkdirSync(join(bucket, 'node_modules', 'pnpm', 'bin'), { recursive: true })
  writeFileSync(join(bucket, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'), `console.log('${PNPM_VERSION}')\n`)
  writeFileSync(join(bucket, '.complete.json'), JSON.stringify({ version: PNPM_VERSION }))
  const reused = ensurePnpmBucket({ sharedRoot: shared })
  assert.equal(reused.bucket, bucket)
  assert.equal(reused.version, PNPM_VERSION)
  writeFileSync(join(bucket, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'), "console.log('0.0.0')\n")
  const repaired = ensurePnpmBucket({
    sharedRoot: shared,
    install: () => {
      mkdirSync(join(bucket, 'node_modules', 'pnpm', 'bin'), { recursive: true })
      writeFileSync(join(bucket, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'), `console.log('${PNPM_VERSION}')\n`)
    },
  })
  assert.equal(repaired.version, PNPM_VERSION)
  rmSync(shared, { recursive: true, force: true })
})

test('writes a record that reads back current', () => {
  const root = mkdtempSync(join(tmpdir(), 'bootstrap-record-'))
  writeFileSync(join(root, 'package.json'), '{"engines":{"node":">=24.9.0"}}\n')
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}\n')
  writeFileSync(join(root, 'coverage.baseline.json'), '{"node":{"version":"v24.22.2"}}\n')
  writeFileSync(join(root, 'coverage.config.json'), '{"primaryNodeMajor":24}\n')
  const pnpm = { bucket: pnpmBucket('/shared'), version: PNPM_VERSION, js: '/x/pnpm.mjs', binDir: '/x/bin', node: process.execPath }
  const path = writeToolchainRecord({ root, pnpm, chromium: null })
  assert.ok(existsSync(path))
  assert.equal(readRecord(root).state, 'current')
  rmSync(root, { recursive: true, force: true })
})

test('reads the Chromium bucket and revisions from the local package', () => {
  const root = mkdtempSync(join(tmpdir(), 'bootstrap-chromium-'))
  const shared = mkdtempSync(join(tmpdir(), 'bootstrap-chromium-shared-'))
  mkdirSync(join(root, 'node_modules', 'playwright-core'), { recursive: true })
  writeFileSync(join(root, 'node_modules', 'playwright-core', 'package.json'), '{"version":"1.65.1"}\n')
  writeFileSync(
    join(root, 'node_modules', 'playwright-core', 'browsers.json'),
    JSON.stringify({ browsers: [
      { name: 'chromium', revision: '1255' },
      { name: 'chromium-headless-shell', revision: '1255' },
      { name: 'ffmpeg', revision: '1013' },
    ] }),
  )
  const fields = chromiumRecordFields({ root, sharedRoot: shared, env: {} })
  assert.equal(fields.browsersPath, join(shared, 'browsers', 'playwright-1.65.1'))
  assert.deepEqual(fields.revisions, { chromium: '1255', headlessShell: '1255', ffmpeg: '1013' })
  rmSync(root, { recursive: true, force: true })
  rmSync(shared, { recursive: true, force: true })
})

test('deps-only skips the doctor and tests', () => {
  const plan = resolvePlan({ depsOnly: true }, { dependenciesPresent: true })
  assert.equal(plan.doctor, false)
  assert.equal(plan.plainTest, false)
  assert.equal(plan.verification, false)
  assert.equal(plan.lab, false)
  assert.equal(plan.chromium, true)
  assert.equal(plan.record, true)
  assert.equal(plan.install, false)
})

test('reads the baseline Node version from coverage.baseline.json', () => {
  assert.equal(readBaselineNodeVersion(ROOT), BASELINE)
  assert.equal(parseBaselineNodeVersion('{"node":{"version":"v24.9.0"}}'), '24.9.0')
})

test('rejects a baseline without a concrete node version', () => {
  assert.throws(() => parseBaselineNodeVersion('{}'), /node version/)
  assert.throws(() => parseBaselineNodeVersion('{"node":{"version":"24"}}'), /node version/)
})

test('normalizes a version with or without the v prefix', () => {
  assert.equal(normalizeVersion('v24.22.2'), '24.22.2')
  assert.equal(normalizeVersion('24.22.2'), '24.22.2')
  assert.throws(() => normalizeVersion('24'), /unsupported Node version/)
})

test('selects the highest qualifying host runtime', () => {
  const selected = selectNodeCandidate(
    [
      { version: 'v26.13.1', path: '/host/26' },
      { version: 'v24.8.0', path: '/host/24.8' },
      { version: 'v24.9.0', path: '/host/24.9' },
      { version: 'v24.22.2', path: '/host/24.22.2' },
    ],
    { primaryMajor: 24, range: '>=24.9.0' },
  )
  assert.equal(selected.path, '/host/24.22.2')
})

test('selects nothing when no candidate qualifies', () => {
  assert.equal(
    selectNodeCandidate(
      [{ version: 'v26.13.1', path: '/host/26' }, { version: 'v24.8.0', path: '/host/24.8' }],
      { primaryMajor: 24, range: '>=24.9.0' },
    ),
    undefined,
  )
})

test('names the platform asset and URL', () => {
  assert.equal(
    assetName({ version: 'v24.22.2', platform: 'darwin', arch: 'arm64' }),
    'node-v24.22.2-darwin-arm64.tar.gz',
  )
  assert.equal(
    assetName({ version: '24.22.2', platform: 'linux', arch: 'x64' }),
    'node-v24.22.2-linux-x64.tar.gz',
  )
  assert.equal(
    assetUrl({ version: 'v24.22.2', platform: 'darwin', arch: 'arm64' }),
    'https://nodejs.org/dist/v24.22.2/node-v24.22.2-darwin-arm64.tar.gz',
  )
  assert.equal(
    assetUrl({ version: 'v24.22.2', platform: 'darwin', arch: 'arm64', mirror: 'https://mirror.test/node/' }),
    'https://mirror.test/node/v24.22.2/node-v24.22.2-darwin-arm64.tar.gz',
  )
  assert.equal(
    shasumsUrl('v24.22.2', 'https://mirror.test/node/'),
    'https://mirror.test/node/v24.22.2/SHASUMS256.txt',
  )
})

test('rejects an unsupported platform', () => {
  assert.throws(
    () => assetName({ version: '24.22.2', platform: 'win32', arch: 'x64' }),
    /unsupported platform/,
  )
})

test('parses the checksum for the exact asset', () => {
  const text = [
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  node-v24.22.2-darwin-arm64.tar.gz',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  node-v24.22.2-darwin-x64.tar.gz',
  ].join('\n')
  assert.equal(
    parseShasum(text, 'node-v24.22.2-darwin-arm64.tar.gz'),
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  )
  assert.equal(parseShasum(text, 'node-v24.22.2-linux-x64.tar.gz'), undefined)
})

test('lists the global candidate roots without calling a version manager', () => {
  const roots = globalCandidateRoots({ home: '/Users/tester', platform: 'darwin' })
  assert.equal(roots.fnm, '/Users/tester/.local/share/fnm/node-versions')
  assert.equal(roots.nvm, '/Users/tester/.nvm/versions/node')
  assert.equal(roots.volta, '/Users/tester/.volta/tools/image/node')
  assert.equal(roots.asdf, '/Users/tester/.asdf/installs/nodejs')
  assert.ok(roots.brew.includes('/opt/homebrew/opt/node@24/bin/node'))
})

test('prints the baseline version from the shell without a download', () => {
  const result = spawnSync('sh', [join(ROOT, 'scripts', 'bootstrap.sh'), '--print-node-version'], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), BASELINE)
})

test('the shell prints the same asset name as bootstrap-lib', () => {
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux'
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const expected = assetName({ version: BASELINE, platform, arch })
  const result = spawnSync('sh', [join(ROOT, 'scripts', 'bootstrap.sh'), '--print-asset'], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), expected)
})

test('the shell lists the documented candidate roots', (t) => {
  const home = process.env.HOME
  if (home === undefined) {
    t.skip('HOME is unset')
    return
  }
  const roots = globalCandidateRoots({ home, platform: process.platform })
  const result = spawnSync('sh', [join(ROOT, 'scripts', 'bootstrap.sh'), '--print-candidate-paths'], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  for (const value of [roots.fnm, roots.nvm, roots.volta, roots.asdf]) {
    assert.ok(result.stdout.includes(value), value)
  }
})

test('the shell forwards options after the separator', () => {
  const result = spawnSync('sh', [join(ROOT, 'scripts', 'bootstrap.sh'), '--', '--help'], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Usage: scripts\/bootstrap\.sh/)
})

test('parses the re-run and download options', () => {
  const options = parseBootstrapArgs([
    '--skip-install',
    '--playwright-host',
    'https://mirror.example',
    '--reset-browsers',
  ])
  assert.equal(options.skipInstall, true)
  assert.equal(options.playwrightHost, 'https://mirror.example')
  assert.equal(options.resetBrowsers, true)
})

test('refuses a download host without a value', () => {
  assert.throws(() => parseBootstrapArgs(['--playwright-host']), /needs a value/)
  assert.throws(() => parseBootstrapArgs(['--playwright-host', '--full']), /needs a value/)
})

test('an invocation through a symlinked directory still runs the entry point', (t) => {
  const base = mkdtempSync(join(tmpdir(), 'bootstrap-symlink-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const link = join(base, 'repo')
  symlinkSync(ROOT, link, 'dir')
  const result = spawnSync(process.execPath, [join(link, 'scripts', 'bootstrap.mjs'), '--help'], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Usage: scripts\/bootstrap\.sh/)
})

test('the help surfaces name the new options and the non-duplicated full mode', () => {
  const help = spawnSync(process.execPath, [join(ROOT, 'scripts', 'bootstrap.mjs'), '--help'], {
    encoding: 'utf8',
  })
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /instead of the plain suite/)
  const shell = readFileSync(join(ROOT, 'scripts', 'bootstrap.sh'), 'utf8')
  const contributing = readFileSync(join(ROOT, 'CONTRIBUTING.md'), 'utf8')
  for (const option of ['--skip-install', '--playwright-host', '--reset-browsers']) {
    assert.ok(help.stdout.includes(option), option)
    assert.ok(shell.includes(option), option)
    assert.ok(contributing.includes(option), option)
  }
})

test('refuses a browser reset when Playwright is skipped', () => {
  assert.throws(
    () => parseBootstrapArgs(['--reset-browsers', '--skip-playwright']),
    /cannot be combined/,
  )
})

test('the default plan installs, runs the plain suite and checks the doctor', () => {
  const plan = resolvePlan(parseBootstrapArgs([]), { browserPresent: false, dependenciesPresent: true })
  assert.equal(plan.install, true)
  assert.equal(plan.doctor, true)
  assert.equal(plan.plainTest, true)
  assert.equal(plan.verification, false)
  assert.equal(plan.lab, false)
  assert.equal(plan.missingDependencies, false)
})

test('full mode verifies and runs the lab without a plain suite pass', () => {
  const plan = resolvePlan(parseBootstrapArgs(['--full']), { browserPresent: true, dependenciesPresent: true })
  assert.equal(plan.plainTest, false)
  assert.equal(plan.verification, true)
  assert.equal(plan.lab, true)
})

test('--skip-test turns only the plain suite off', () => {
  const plan = resolvePlan(parseBootstrapArgs(['--skip-test']), { browserPresent: false, dependenciesPresent: true })
  assert.equal(plan.plainTest, false)
  assert.equal(plan.verification, false)
  assert.equal(plan.doctor, true)
})

test('--skip-playwright leaves the other steps in place', () => {
  const options = parseBootstrapArgs(['--skip-playwright'])
  const plan = resolvePlan(options, { dependenciesPresent: true })
  assert.equal(options.skipPlaywright, true)
  assert.equal(plan.plainTest, true)
})

test('--reset-browsers parses without affecting the other plan steps', () => {
  const options = parseBootstrapArgs(['--reset-browsers'])
  const plan = resolvePlan(options, { dependenciesPresent: true })
  assert.equal(options.resetBrowsers, true)
  assert.equal(plan.doctor, true)
})

test('--skip-install reuses dependencies and reports a missing directory', () => {
  const present = resolvePlan(parseBootstrapArgs(['--skip-install']), { browserPresent: false, dependenciesPresent: true })
  assert.equal(present.install, false)
  assert.equal(present.missingDependencies, false)
  const missing = resolvePlan(parseBootstrapArgs(['--skip-install']), { browserPresent: false, dependenciesPresent: false })
  assert.equal(missing.install, false)
  assert.equal(missing.missingDependencies, true)
})

test('maps the download host to the Playwright environment', () => {
  assert.deepEqual(playwrightEnv(), {})
  assert.deepEqual(playwrightEnv('https://mirror.example'), {
    PLAYWRIGHT_DOWNLOAD_HOST: 'https://mirror.example',
  })
})

test('bootstrap resolves the explicit or default browser path', () => {
  assert.match(browsersPath({}), /browsers[\\/]playwright-[0-9]/)
  assert.ok(!browsersPath({}).includes(join('.cache', 'lab', 'pw-browsers')))
  assert.equal(browsersPath({ PLAYWRIGHT_BROWSERS_PATH: '/shared/browsers' }), '/shared/browsers')
  assert.equal(browsersPath({ PLAYWRIGHT_BROWSERS_PATH: 'relative/browsers' }), join(ROOT, 'relative', 'browsers'))
})

test('the browser step forwards --playwright-host to the installer', () => {
  const root = mkdtempSync(join(tmpdir(), 'bootstrap-host-'))
  const browsers = join(root, 'pw-browsers')
  let seen
  try {
    runBrowserStep(
      { resetBrowsers: false, playwrightHost: 'https://mirror.example' },
      {
        browsersPath: browsers,
        install: ({ browsersPath: path, host }) => {
          seen = host
          mkdirSync(join(path, 'chrome'), { recursive: true })
          writeFileSync(join(path, 'chrome', 'chrome'), '')
        },
      },
    )
    assert.equal(seen, 'https://mirror.example')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the bootstrap browser step contends on the same shared lock', () => {
  const root = mkdtempSync(join(tmpdir(), 'bootstrap-lock-'))
  const browsers = join(root, 'pw-browsers')
  const marker = join(browsers, 'chrome', 'chrome')
  let installs = 0
  mkdirSync(join(browsers, 'chrome'), { recursive: true })
  writeFileSync(marker, 'present')
  const install = () => {
    installs += 1
    mkdirSync(join(browsers, 'chrome'), { recursive: true })
    writeFileSync(marker, 'installed')
  }
  const held = acquireInstallLockSync(installLockPath(browsers), 'parent', { timeoutMs: 1000 })
  try {
    assert.throws(
      () => runBrowserStep({ resetBrowsers: true }, { browsersPath: browsers, install, lockOptions: { timeoutMs: 30, pollMs: 5 } }),
      /timed out waiting/,
    )
    assert.equal(existsSync(marker), true)
    assert.equal(installs, 0)
  } finally {
    releaseInstallLock(held)
  }
  try {
    assert.deepEqual(runBrowserStep({ resetBrowsers: true }, { browsersPath: browsers, install }), { installed: true, reused: false })
    assert.equal(installs, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('bootstrap resolves OPENSPEC_FLOW_NPM_CACHE and ignores npm_config_cache', () => {
  const fallback = join(ROOT, '.cache', 'npm')
  assert.equal(resolveNpmCache({ env: { OPENSPEC_FLOW_NPM_CACHE: '/cache' } }), '/cache')
  assert.equal(resolveNpmCache({ env: { npm_config_cache: '/npm' } }), fallback)
  assert.equal(resolveNpmCache({ env: { OPENSPEC_FLOW_NPM_CACHE: '/cache', npm_config_cache: '/npm' } }), '/cache')
  assert.equal(resolveNpmCache({ env: {} }), fallback)
})

test('the npm child environment carries both cache selectors', () => {
  assert.deepEqual(npmEnvFor({ cache: '/cache' }), {
    npm_config_cache: '/cache',
    OPENSPEC_FLOW_NPM_CACHE: '/cache',
  })
  assert.deepEqual(npmEnvFor({ cache: '/cache', registry: 'https://registry.example' }), {
    npm_config_cache: '/cache',
    OPENSPEC_FLOW_NPM_CACHE: '/cache',
    npm_config_registry: 'https://registry.example',
  })
})

test('names npm ci when dependencies are missing', () => {
  assert.match(dependenciesError(), /npm ci/)
})

test('the completion hint names the DSH cache and prune command', () => {
  const hint = completionHint()
  assert.match(hint, /\.cache\/lab\/dsh/)
  assert.match(hint, /npm run lab -- cache prune/)
})


test('collection keeps referenced buckets and deletes old unreferenced ones', () => {
  const root = mkdtempSync(join(tmpdir(), 'bootstrap-gc-root-'))
  const shared = mkdtempSync(join(tmpdir(), 'bootstrap-gc-shared-'))
  try {
    for (const file of ['package.json', 'package-lock.json', 'coverage.baseline.json', 'coverage.config.json']) {
      writeFileSync(join(root, file), file === 'package.json' ? '{"engines":{"node":">=24.9.0"}}\n' : '{"lockfileVersion":3,"packages":{}}\n')
    }
    writeFileSync(join(root, 'coverage.baseline.json'), '{"node":{"version":"v24.22.2"}}\n')
    writeFileSync(join(root, 'coverage.config.json'), '{"primaryNodeMajor":24}\n')
    spawnSync('git', ['init', '-q'], { cwd: root })
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root })
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: root })
    spawnSync('git', ['add', '.'], { cwd: root })
    spawnSync('git', ['commit', '-qm', 'initial'], { cwd: root })
    const nodeDir = join(shared, 'toolchain', 'node', '24.22.2')
    const pnpmDir = join(shared, 'toolchain', 'pnpm', PNPM_VERSION)
    const browserDir = join(shared, 'browsers', 'playwright-1.65.1')
    const staleDir = join(shared, 'toolchain', 'pnpm', '9.9.9')
    for (const dir of [nodeDir, pnpmDir, browserDir, staleDir]) mkdirSync(dir, { recursive: true })
    const node = join(nodeDir, 'bin', 'node')
    mkdirSync(join(nodeDir, 'bin'), { recursive: true })
    writeFileSync(node, '')
    const pnpmJs = join(pnpmDir, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
    mkdirSync(join(pnpmDir, 'node_modules', 'pnpm', 'bin'), { recursive: true })
    writeFileSync(pnpmJs, '')
    writeRecord(root, buildRecord({
      root,
      requirements: { nodeRange: '>=24.9.0', primaryNodeMajor: 24, pnpm: PNPM_VERSION },
      node: { path: node, version: 'v24.22.2', source: 'bucket' },
      npm: { path: node, version: '11.0.0' },
      pnpm: { bucket: pnpmDir, version: PNPM_VERSION, js: pnpmJs, binDir: join(pnpmDir, 'node_modules', '.bin'), node },
      chromium: { playwrightVersion: '1.65.1', browsersPath: browserDir, revisions: { chromium: '1', headlessShell: '1', ffmpeg: '1' } },
    }))
    const old = new Date(Date.now() - 2 * 60 * 60_000)
    for (const dir of [nodeDir, pnpmDir, browserDir, staleDir]) utimesSync(dir, old, old)
    collectBuckets({ mainRoot: root, sharedRoot: shared })
    assert.equal(existsSync(staleDir), false)
    assert.equal(existsSync(pnpmDir), true)
    assert.equal(existsSync(nodeDir), true)
    assert.equal(existsSync(browserDir), true)
    const youngDir = join(shared, 'toolchain', 'pnpm', '2.2.2')
    mkdirSync(youngDir, { recursive: true })
    collectBuckets({ mainRoot: root, sharedRoot: shared })
    assert.equal(existsSync(youngDir), true)
    const lockedDir = join(shared, 'toolchain', 'pnpm', '3.3.3')
    mkdirSync(lockedDir, { recursive: true })
    utimesSync(lockedDir, old, old)
    const held = acquireInstallLockSync(installLockPath(lockedDir), 'test', { timeoutMs: 1000 })
    try {
      collectBuckets({ mainRoot: root, sharedRoot: shared })
      assert.equal(existsSync(lockedDir), true)
    } finally {
      releaseInstallLock(held)
    }
    const lockOnly = join(shared, 'toolchain', 'pnpm', '5.5.5.install.lock')
    mkdirSync(lockOnly, { recursive: true })
    utimesSync(lockOnly, old, old)
    collectBuckets({ mainRoot: root, sharedRoot: shared })
    assert.equal(existsSync(lockOnly), true)
    const dryDir = join(shared, 'toolchain', 'pnpm', '4.4.4')
    mkdirSync(dryDir, { recursive: true })
    utimesSync(dryDir, old, old)
    collectBuckets({ mainRoot: root, sharedRoot: shared, dryRun: true })
    assert.equal(existsSync(dryDir), true)
    const linked = join(root, '..', `bootstrap-gc-missing-${process.pid}-${Date.now()}`)
    spawnSync('git', ['worktree', 'add', '--detach', linked, 'HEAD'], { cwd: root, stdio: 'ignore' })
    rmSync(linked, { recursive: true, force: true })
    assert.doesNotThrow(() => collectBuckets({ mainRoot: root, sharedRoot: shared, dryRun: true }))
    spawnSync('git', ['worktree', 'prune'], { cwd: root, stdio: 'ignore' })

    writeFileSync(join(root, '.cache', 'toolchain', 'manifest.json'), '{')
    mkdirSync(join(shared, 'toolchain', 'pnpm', '8.8.8'), { recursive: true })
    utimesSync(join(shared, 'toolchain', 'pnpm', '8.8.8'), old, old)
    assert.throws(() => collectBuckets({ mainRoot: root, sharedRoot: shared }), /cannot be read/)
    assert.equal(existsSync(join(shared, 'toolchain', 'pnpm', '8.8.8')), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(shared, { recursive: true, force: true })
  }
})
