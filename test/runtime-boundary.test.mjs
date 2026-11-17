import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

test('the manifest declares no DSH runtime dependency', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      assert.ok(!name.startsWith('@deepseek-ai/'), `${field} must not carry ${name}`)
    }
  }
})

test('runtime imports use only Node built-ins and relative modules', () => {
  const files = [join(ROOT, 'index.js'), join(ROOT, 'reviewer.js')]
  for (const entry of readdirSync(join(ROOT, 'lib'), { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) files.push(join(entry.parentPath, entry.name))
  }
  const forbidden = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const line of source.split('\n')) {
      const match = line.match(/^\s*(?:import|export)\b[^'"]*?\bfrom\s+'([^']+)'/)
        ?? line.match(/^\s*import\s+'([^']+)'/)
      if (match === null) continue
      const specifier = match[1]
      if (specifier.startsWith('node:') || specifier.startsWith('.')) continue
      forbidden.push(`${file.slice(ROOT.length)}: ${specifier}`)
    }
  }
  assert.deepEqual(forbidden, [])
})
