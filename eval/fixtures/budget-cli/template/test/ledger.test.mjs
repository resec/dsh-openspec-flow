import assert from 'node:assert/strict'
import test from 'node:test'
import { parseAmount, summarize } from '../src/ledger.js'

test('parses numeric strings and numbers', () => {
  assert.equal(parseAmount('12.50'), 12.5)
  assert.equal(parseAmount(7), 7)
})

test('rejects blank and non-numeric amounts', () => {
  assert.throws(() => parseAmount(''), /invalid amount/u)
  assert.throws(() => parseAmount('abc'), /invalid amount/u)
  assert.throws(() => parseAmount(Number.NaN), /invalid amount/u)
})

test('summarizes count and a rounded total', () => {
  assert.deepEqual(summarize([{ amount: '0.10' }, { amount: '0.20' }]), { count: 2, total: 0.3 })
})
