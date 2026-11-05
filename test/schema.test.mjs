import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { assertBuiltinSchema, BUILTIN_SCHEMA, userSchemasDir } from '../lib/schema.js'

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-schema-'))
  mkdirSync(join(root, 'openspec'), { recursive: true })
  return root
}

function writeSchema(dir) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'schema.yaml'), 'name: spec-driven\nversion: 1\n')
}

function withUserData(home, fn) {
  const previous = process.env.XDG_DATA_HOME
  process.env.XDG_DATA_HOME = home
  try {
    return fn()
  } finally {
    if (previous === undefined) delete process.env.XDG_DATA_HOME
    else process.env.XDG_DATA_HOME = previous
  }
}

test('accepts the built-in schema when neither project nor user shadows it', () => {
  const root = makeRoot()
  const userHome = mkdtempSync(join(tmpdir(), 'openspec-flow-user-'))
  try {
    withUserData(userHome, () => {
      assert.equal(BUILTIN_SCHEMA, 'spec-driven')
      assert.doesNotThrow(() => assertBuiltinSchema('spec-driven', root, 'demo'))
      assert.equal(userSchemasDir(), join(userHome, 'openspec', 'schemas'))
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(userHome, { recursive: true, force: true })
  }
})

test('rejects a custom schema name with an actionable error', () => {
  const root = makeRoot()
  const userHome = mkdtempSync(join(tmpdir(), 'openspec-flow-user-'))
  try {
    withUserData(userHome, () => {
      assert.throws(
        () => assertBuiltinSchema('custom', root, 'demo'),
        /Unsupported OpenSpec schema 'custom' for change 'demo'.*built-in 'spec-driven'/s,
      )
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(userHome, { recursive: true, force: true })
  }
})

test('rejects a project-local spec-driven schema', () => {
  const root = makeRoot()
  const userHome = mkdtempSync(join(tmpdir(), 'openspec-flow-user-'))
  const projectSchema = join(root, 'openspec', 'schemas', 'spec-driven', 'schema.yaml')
  try {
    writeSchema(join(root, 'openspec', 'schemas', 'spec-driven'))
    withUserData(userHome, () => {
      assert.throws(
        () => assertBuiltinSchema('spec-driven', root, 'demo'),
        new RegExp(`shadowed by the project schema at '${projectSchema.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`),
      )
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(userHome, { recursive: true, force: true })
  }
})

test('rejects a user-level spec-driven schema', () => {
  const root = makeRoot()
  const userHome = mkdtempSync(join(tmpdir(), 'openspec-flow-user-'))
  const userSchema = join(userHome, 'openspec', 'schemas', 'spec-driven', 'schema.yaml')
  try {
    writeSchema(join(userHome, 'openspec', 'schemas', 'spec-driven'))
    withUserData(userHome, () => {
      assert.throws(
        () => assertBuiltinSchema('spec-driven', root, 'demo'),
        new RegExp(`shadowed by the user schema at '${userSchema.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`),
      )
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(userHome, { recursive: true, force: true })
  }
})

test('fails closed when no project root can be resolved', () => {
  assert.throws(
    () => assertBuiltinSchema('spec-driven', '', 'demo'),
    /no project root was resolved/,
  )
})
