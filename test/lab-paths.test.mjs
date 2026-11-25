import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { NPM_CACHE, ROOT, resolveBrowsersPath, resolveNpmCache } from '../scripts/lab/core/paths.mjs'

test('the lab browser path follows the root and PLAYWRIGHT_BROWSERS_PATH', () => {
  assert.equal(resolveBrowsersPath({ root: ROOT, env: {} }), join(ROOT, '.cache', 'lab', 'pw-browsers'))
  const custom = join(ROOT, 'custom-root')
  assert.equal(resolveBrowsersPath({ root: custom, env: {} }), join(custom, '.cache', 'lab', 'pw-browsers'))
  assert.equal(resolveBrowsersPath({ root: custom, env: { PLAYWRIGHT_BROWSERS_PATH: '/shared/pw' } }), '/shared/pw')
  assert.equal(resolveBrowsersPath({ root: custom, env: { PLAYWRIGHT_BROWSERS_PATH: 'relative/pw' } }), join(custom, 'relative', 'pw'))
})

test('the lab npm cache prefers OPENSPEC_FLOW_NPM_CACHE and ignores npm_config_cache', () => {
  assert.equal(resolveNpmCache({ env: { OPENSPEC_FLOW_NPM_CACHE: '/cache' } }), '/cache')
  assert.equal(resolveNpmCache({ env: { npm_config_cache: '/npm' } }), NPM_CACHE)
  assert.equal(resolveNpmCache({ env: { OPENSPEC_FLOW_NPM_CACHE: '/cache', npm_config_cache: '/npm' } }), '/cache')
  assert.equal(resolveNpmCache({ env: {} }), NPM_CACHE)
})
