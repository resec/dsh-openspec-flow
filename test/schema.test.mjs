import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { assertBuiltinSchema, assertCreatedChangeSchema, assertNewChangeSchema, BUILTIN_SCHEMA, projectRootFromStatus, readProjectSchema, userSchemasDir } from '../lib/schema.js'

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


test('resolves a project root from planningHome or changeRoot', () => {
  assert.equal(projectRootFromStatus({ planningHome: { root: '/project' } }), '/project')
  assert.equal(projectRootFromStatus({ changeRoot: '/project/openspec/changes/c' }), '/project')
  assert.equal(projectRootFromStatus({}), '')
  assert.equal(projectRootFromStatus(null), '')
})

test('builds the Windows user schema directory with and without LOCALAPPDATA', () => {
  assert.equal(userSchemasDir({ LOCALAPPDATA: '/local' }, 'win32'), join('/local', 'openspec', 'schemas'))
  assert.match(userSchemasDir({}, 'win32'), /AppData[\\/]Local[\\/]openspec[\\/]schemas$/)
})

test('rejects a missing schema name', () => {
  assert.throws(() => assertBuiltinSchema('', '/project', 'c'), /no schema name/)
})

test('reads a quoted project schema and ignores an inline comment', () => {
  const root = makeRoot()
  try {
    writeFileSync(join(root, 'openspec', 'config.yaml'), 'schema: "custom" # project choice\n')
    assert.deepEqual(readProjectSchema(root), {
      path: join(root, 'openspec', 'config.yaml'),
      value: 'custom',
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('accepts a new change only when the project schema is spec-driven', () => {
  const root = makeRoot()
  const userHome = mkdtempSync(join(tmpdir(), 'openspec-flow-user-'))
  try {
    withUserData(userHome, () => {
      writeFileSync(join(root, 'openspec', 'config.yaml'), "schema: 'spec-driven' # built-in\n")
      assert.doesNotThrow(() => assertNewChangeSchema(root, 'demo'))
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(userHome, { recursive: true, force: true })
  }
})

test('rejects a new change when the project selects a custom schema', () => {
  const root = makeRoot()
  const config = join(root, 'openspec', 'config.yaml')
  const userHome = mkdtempSync(join(tmpdir(), 'openspec-flow-user-'))
  try {
    withUserData(userHome, () => {
      writeFileSync(config, 'schema: custom\n')
      assert.throws(
        () => assertNewChangeSchema(root, 'demo'),
        new RegExp(`Unsupported OpenSpec schema 'custom' in '${config.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}' for new change 'demo'`),
      )
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(userHome, { recursive: true, force: true })
  }
})

test('rejects a new change when the built-in schema is shadowed', () => {
  const root = makeRoot()
  const userHome = mkdtempSync(join(tmpdir(), 'openspec-flow-user-'))
  try {
    writeSchema(join(root, 'openspec', 'schemas', 'spec-driven'))
    withUserData(userHome, () => {
      assert.throws(
        () => assertNewChangeSchema(root, 'demo'),
        /shadowed by the project schema/,
      )
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(userHome, { recursive: true, force: true })
  }
})

test('fails closed when the project config cannot be read', () => {
  const root = makeRoot()
  const userHome = mkdtempSync(join(tmpdir(), 'openspec-flow-user-'))
  try {
    mkdirSync(join(root, 'openspec', 'config.yaml'))
    withUserData(userHome, () => {
      assert.throws(
        () => assertNewChangeSchema(root, 'demo'),
        /Cannot verify the project schema for new change 'demo'.*Cannot read/s,
      )
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(userHome, { recursive: true, force: true })
  }
})

test('returns undefined when the project has no config file', () => {
  const root = makeRoot()
  try {
    assert.equal(readProjectSchema(root), undefined)
    assert.equal(readProjectSchema(''), undefined)
    assert.equal(readProjectSchema(undefined), undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('reads an unquoted schema with an inline comment', () => {
  const root = makeRoot()
  try {
    writeFileSync(join(root, 'openspec', 'config.yaml'), 'schema: custom # project choice\n')
    assert.deepEqual(readProjectSchema(root), {
      path: join(root, 'openspec', 'config.yaml'),
      value: 'custom',
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('keeps an unterminated quote in the scalar', () => {
  const root = makeRoot()
  try {
    writeFileSync(join(root, 'openspec', 'config.yaml'), 'schema: "custom\n')
    assert.deepEqual(readProjectSchema(root), {
      path: join(root, 'openspec', 'config.yaml'),
      value: '"custom',
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('handles a config without a schema line', () => {
  const root = makeRoot()
  const userHome = mkdtempSync(join(tmpdir(), 'openspec-flow-user-'))
  try {
    writeFileSync(join(root, 'openspec', 'config.yaml'), '# no schema here\n')
    assert.deepEqual(readProjectSchema(root), {
      path: join(root, 'openspec', 'config.yaml'),
      value: '',
    })
    withUserData(userHome, () => {
      assert.doesNotThrow(() => assertNewChangeSchema(root, 'demo'))
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(userHome, { recursive: true, force: true })
  }
})

test('accepts and rejects the schema reported by the create command', () => {
  assert.doesNotThrow(() => assertCreatedChangeSchema('spec-driven', 'demo'))
  assert.throws(
    () => assertCreatedChangeSchema('custom', 'demo'),
    /returned schema 'custom' for 'demo'.*only supports the built-in 'spec-driven'/s,
  )
})
