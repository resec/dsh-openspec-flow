import { readFileSync } from 'node:fs'
import { renderSummary } from './report.js'

const args = process.argv.slice(2)
const file = args[0]
if (file === undefined) {
  console.error('usage: node src/cli.js <file>')
  process.exit(1)
}

let transactions
try {
  transactions = JSON.parse(readFileSync(file, 'utf8'))
} catch (error) {
  console.error(`cannot read ${file}: ${error.message}`)
  process.exit(1)
}

console.log(renderSummary(transactions))
