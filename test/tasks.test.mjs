import assert from 'node:assert/strict'
import test from 'node:test'
import {
  describeTask,
  findTask,
  flipCheckbox,
  nextTask,
  numericIdOf,
  parseTaskLines,
  replaceLine,
  summarize,
  taskKey,
} from '../lib/tasks.js'

test('parses every OpenSpec list marker and ignores link bullets', () => {
  const content = [
    '- [x] 1.1 done',
    '* [ ] 1.2 star',
    '+ [~] 1.3 tilde',
    '1. [ ] 1.4 ordered dot',
    '2) [X] 1.5 ordered paren',
    '  - [ ] 1.6 nested',
    '- [Doc](./doc.md)',
    '- [1](./one)',
    '- [ ]',
  ].join('\n')
  const tasks = parseTaskLines(content)
  assert.equal(tasks.length, 7)
  assert.deepEqual(
    tasks.map((task) => task.description),
    ['1.1 done', '1.2 star', '1.3 tilde', '1.4 ordered dot', '1.5 ordered paren', '1.6 nested', ''],
  )
  assert.deepEqual(
    tasks.map((task) => task.done),
    [true, false, false, false, true, false, false],
  )
  assert.deepEqual(
    tasks.map((task) => task.id),
    ['1', '2', '3', '4', '5', '6', null],
  )
  assert.deepEqual(
    tasks.map((task) => task.line),
    [1, 2, 3, 4, 5, 6, 9],
  )
})

test('reads a wrapped task as its whole first paragraph', () => {
  const content = [
    '- [ ] 1.1 A task that',
    '  wraps onto a second line',
    '- [ ] 1.2 Next task',
  ].join('\n')
  const tasks = parseTaskLines(content)
  assert.equal(tasks.length, 2)
  assert.equal(tasks[0].description, '1.1 A task that wraps onto a second line')
  assert.equal(tasks[1].description, '1.2 Next task')
})

test('drops a trailing hard break before joining the next line', () => {
  const content = ['- [ ] 1.1 A task that \\', '  continues after a break'].join('\n')
  const tasks = parseTaskLines(content)
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].description, '1.1 A task that continues after a break')
})

test('ends the text at a sibling checkbox', () => {
  const content = ['- [ ] 1.1 Wrapped \\', '  continues', '- [ ] 1.2 Second'].join('\n')
  const tasks = parseTaskLines(content)
  assert.equal(tasks.length, 2)
  assert.equal(tasks[0].description, '1.1 Wrapped continues')
  assert.equal(tasks[1].description, '1.2 Second')
})

test('ends the text at a plain list item or heading without making it a task', () => {
  const content = [
    '- [ ] 1.1 Wrapped',
    '  detail',
    '- plain note',
    '## Heading',
    '- [ ] 1.2 Next',
  ].join('\n')
  const tasks = parseTaskLines(content)
  assert.equal(tasks.length, 2)
  assert.equal(tasks[0].description, '1.1 Wrapped detail')
  assert.equal(tasks[1].description, '1.2 Next')
})

test('takes the continuation text into an empty checkbox', () => {
  const content = ['- [ ]', '  the continuation text'].join('\n')
  const tasks = parseTaskLines(content)
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].description, 'the continuation text')
  assert.equal(tasks[0].id, '1')
})

test('counts continuation lines as one task', () => {
  const content = ['- [ ] 1.1 one', '  continued', '  more', '- [x] 1.2 two'].join('\n')
  const tasks = parseTaskLines(content)
  const summary = summarize(tasks)
  assert.deepEqual(summary.progress, { total: 2, complete: 1, remaining: 1 })
  assert.deepEqual(
    tasks.map((task) => task.description),
    ['1.1 one continued more', '1.2 two'],
  )
})

test('counts a whitespace-only checkbox whose text starts with a link', () => {
  // The pattern's second alternative, `\s+\]`, matches without capturing the
  // marker, so a box followed by `(` or `[` leaves the group unset. The CLI
  // counts both lines as unfinished tasks; the parser must not throw on them.
  const tasks = parseTaskLines('- [ ](./doc.md)\n- [ ][note]')
  assert.deepEqual(
    tasks.map((task) => task.description),
    ['(./doc.md)', '[note]'],
  )
  assert.deepEqual(
    tasks.map((task) => task.done),
    [false, false],
  )
})

test('reads numeric ids without confusing 1.1 and 1.10', () => {
  assert.equal(numericIdOf('1.1 Install'), '1.1')
  assert.equal(numericIdOf('1.10 Install'), '1.10')
  assert.equal(numericIdOf('1.1.1 Nested'), '1.1.1')
  assert.equal(numericIdOf('1. Do'), '1')
  assert.equal(numericIdOf('1) Do'), '1')
  assert.equal(numericIdOf('Plain task'), null)
  const tasks = parseTaskLines('- [ ] 1.1 one\n- [ ] 1.10 ten\n- [ ] 1.2 two')
  assert.equal(findTask(tasks, '1.1').description, '1.1 one')
  assert.equal(findTask(tasks, '1.10').description, '1.10 ten')
  assert.equal(findTask(tasks, '1.1').line, 1)
})

test('flips only the checkbox content and preserves line endings', () => {
  assert.equal(flipCheckbox('- [ ] 1.1 x'), '- [x] 1.1 x')
  assert.equal(flipCheckbox('- [~] 1.1 x'), '- [x] 1.1 x')
  assert.equal(flipCheckbox('  * [ x ] 1.1 x'), '  * [x] 1.1 x')
  assert.equal(flipCheckbox('- [ ] 1.1 x\r'), '- [x] 1.1 x\r')
  assert.equal(flipCheckbox('- not a task'), '- not a task')

  const content = 'a\r\n- [ ] 1.1 x\r\nb\r\n'
  const lines = content.split('\n')
  const next = replaceLine(content, 2, flipCheckbox(lines[1]))
  assert.equal(next, 'a\r\n- [x] 1.1 x\r\nb\r\n')
})

test('counts text-less checkboxes but skips them when choosing the next task', () => {
  const tasks = parseTaskLines('- [ ]\n- [ ] first\n- [x] done')
  const summary = summarize(tasks)
  assert.deepEqual(summary.progress, { total: 3, complete: 1, remaining: 2 })
  assert.equal(summary.next.description, 'first')
  assert.equal(nextTask(tasks).description, 'first')
  assert.equal(taskKey(tasks[1]), '#1')
})

test('addresses unnumbered tasks with #N and accepts the CLI index', () => {
  const tasks = parseTaskLines('- [ ] first\n- [ ] second\n- [ ] 3.1 numbered')
  assert.equal(findTask(tasks, '#2').description, 'second')
  assert.equal(findTask(tasks, '2').description, 'second')
  assert.equal(findTask(tasks, '3.1').description, '3.1 numbered')
  assert.equal(findTask(tasks, 'nope'), null)
})

test('prefers the line hint and then the exact description', () => {
  const tasks = parseTaskLines('- [ ] one\n- [ ] two\n- [ ] three')
  const hinted = findTask(tasks, '#3', { sourcePath: '/x', line: 3 })
  // The hint only matches when the task's own id matches; the global search
  // still resolves #3 to the third task.
  assert.equal(hinted.description, 'three')
  const byLine = findTask(tasks, '#1', { sourcePath: '/x', line: 1 })
  assert.equal(byLine.description, 'one')
})

test('bounds a long description and marks the truncation', () => {
  const desc = `1.1 ${'x'.repeat(1_500)}`
  const task = parseTaskLines(`- [ ] ${desc}`)[0]
  task.sourcePath = '/tmp/tasks.md'
  const next = describeTask(task)
  assert.equal(next.id, '1.1')
  assert.equal(next.description.length, 1_001)
  assert.equal(next.descriptionTruncated, true)
  assert.equal(next.sourcePath, '/tmp/tasks.md')
})

test('parses an empty file and a CRLF file', () => {
  assert.deepEqual(parseTaskLines(''), [])
  const tasks = parseTaskLines('- [ ] 1.1 first\r\n- [x] 1.2 second\r\n')
  assert.equal(tasks.length, 2)
  assert.equal(tasks[0].line, 1)
  assert.equal(tasks[0].description, '1.1 first')
  assert.equal(tasks[1].done, true)
})
