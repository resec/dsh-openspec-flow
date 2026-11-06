import assert from 'node:assert/strict'
import test from 'node:test'
import { formatCurrency, renderSummary } from '../src/report.js'

test('formats currency with two decimals', () => {
  assert.equal(formatCurrency(5), '5.00')
  assert.equal(formatCurrency(12.5), '12.50')
})

test('renders the summary line', () => {
  assert.equal(renderSummary([{ amount: '1.25' }, { amount: '2.75' }]), 'count 2 total 4.00')
})
