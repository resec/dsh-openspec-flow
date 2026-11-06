import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { formatCurrency, monthlyTotals } from '../src/report.js'

test('groups and sorts monthly totals', () => {
  const rows = monthlyTotals([
    { date: '2026-02-10', amount: '10.10' },
    { date: '2026-01-05', amount: 5 },
    { date: '2026-02-20', amount: '0.90' },
  ])
  assert.deepEqual(rows, [
    { month: '2026-01', total: 5 },
    { month: '2026-02', total: 11 },
  ])
})

test('rejects an invalid calendar date', () => {
  assert.throws(() => monthlyTotals([{ date: '2026-02-30', amount: '1.00' }]), /invalid date/iu)
  assert.throws(() => monthlyTotals([{ date: 'nope', amount: '1.00' }]), /invalid date/iu)
})

test('CLI prints ascending monthly lines', () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-cli-acceptance-'))
  const file = join(dir, 'transactions.json')
  writeFileSync(
    file,
    JSON.stringify([
      { date: '2026-02-10', amount: '10.10' },
      { date: '2026-01-05', amount: '5.00' },
      { date: '2026-02-20', amount: '0.90' },
    ]),
  )
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url))
  const result = spawnSync(process.execPath, [cli, '--by-month', file], { encoding: 'utf8' })
  rmSync(dir, { recursive: true, force: true })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, '2026-01 5.00\n2026-02 11.00\n')
})

test('exports the existing currency formatting for the new mode', () => {
  assert.equal(formatCurrency(11), '11.00')
})
