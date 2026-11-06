import { summarize } from './ledger.js'

export function formatCurrency(value) {
  return Number(value).toFixed(2)
}

export function renderSummary(transactions) {
  const summary = summarize(transactions)
  return `count ${summary.count} total ${formatCurrency(summary.total)}`
}
