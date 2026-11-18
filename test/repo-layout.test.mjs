import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { isGeneratedSkillPath } from '../scripts/check-generated-skills.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

test('the tracked tree carries no generated OpenSpec skill copies', (t) => {
  const result = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    t.skip('git is unavailable')
    return
  }
  const files = result.stdout.split('\n').filter(Boolean)
  const generated = files.filter((path) => isGeneratedSkillPath(path))
  assert.deepEqual(generated, [], `generated skill paths are tracked: ${generated.join(', ')}`)
  assert.ok(files.includes('skills/openspec-propose/SKILL.md'), 'the root plugin skill is missing')
})
