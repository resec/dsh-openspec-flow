export function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function parseAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim() === '') throw new Error('invalid amount')
  const amount = Number(value)
  if (!Number.isFinite(amount)) throw new Error('invalid amount')
  return amount
}

export function summarize(transactions) {
  if (!Array.isArray(transactions)) throw new Error('transactions must be an array')
  let total = 0
  for (const transaction of transactions) total += parseAmount(transaction?.amount)
  return { count: transactions.length, total: round2(total) }
}
