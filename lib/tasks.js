/**
 * OpenSpec task-line parsing and projection.
 *
 * The parser intentionally mirrors `src/utils/task-progress.ts` in OpenSpec
 * 1.16.1: every list marker, one-token checkbox, leading whitespace, and the
 * link-syntax guards. A task this parser drops is a task `openspec list`,
 * `openspec status` and `openspec archive` still count, so the two sources
 * would disagree about what is left. The numeric prefix is *not* stripped from
 * the description; the model sees the same text the CLI returns.
 *
 * @module dsh-openspec-flow/tasks
 */

/**
 * One checkbox line.
 *
 * Group 1 is the checkbox marker (`x`/`X` is done; anything else is not), and
 * group 2 is the description, including any `1.1`-style prefix.
 */
export const TASK_LINE_PATTERN =
  /^\s*(?:[-*+]|\d{1,9}[.)])\s*\[(?:\s*([^\]\s]?)\s*\](?![([])|\s+\])\s*(.*)/

/** `1`, `1.1`, `1.1.1` followed by a separator and whitespace. */
export const NUMERIC_PREFIX = /^(\d+(?:\.\d+)*)(?:[.:)\]-]?\s+)/

/** Longest task description returned to the model; the rest is readable at the source line. */
export const MAX_DESCRIPTION = 1_000

/**
 * Parse every checkbox line in one file, in document order.
 * @param content - the file's UTF-8 text.
 * @returns tasks with 1-based line numbers; `id` is assigned only to tasks that
 *   carry text, matching the CLI's `toTaskItems()` filter.
 */
export function parseTaskLines(content) {
  const tasks = []
  const lines = content.split('\n')
  let described = 0
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]
    const match = TASK_LINE_PATTERN.exec(raw)
    if (match === null) continue
    const description = (match[2] ?? '').trim()
    const task = {
      line: index + 1,
      done: (match[1] ?? '').toLowerCase() === 'x',
      description,
      numericId: numericIdOf(description),
      id: null,
      raw,
    }
    if (description.length > 0) {
      described += 1
      task.id = String(described)
    }
    tasks.push(task)
  }
  return tasks
}

/**
 * Read the numeric id from a task description.
 * @param description - text after the checkbox.
 * @returns `1`, `1.1`, `1.10`, or null when the text has no numeric prefix.
 */
export function numericIdOf(description) {
  const match = NUMERIC_PREFIX.exec(description)
  return match === null ? null : match[1]
}

/**
 * The id the tools accept: a numeric prefix, or `#N` for the CLI's 1-based
 * index among tasks that carry text.
 * @param task - a parsed or CLI-shaped task.
 * @returns the task key, or null for a text-less checkbox.
 */
export function taskKey(task) {
  if (task.numericId !== null && task.numericId !== undefined) return task.numericId
  if (task.id === null || task.id === undefined) return null
  return `#${task.id}`
}

/**
 * First task that carries text and is not done.
 * @param tasks - tasks in document order.
 * @returns the next task, or null.
 */
export function nextTask(tasks) {
  for (const task of tasks) {
    if (task.description.length > 0 && !task.done) return task
  }
  return null
}

/**
 * Count every checkbox, including text-less ones, exactly as the CLI does.
 * @param tasks - parsed checkbox lines.
 * @returns `{ progress, next }`.
 */
export function summarize(tasks) {
  let complete = 0
  for (const task of tasks) {
    if (task.done) complete += 1
  }
  return {
    progress: { total: tasks.length, complete, remaining: tasks.length - complete },
    next: nextTask(tasks),
  }
}

/**
 * Mark one checkbox line done without touching anything outside the brackets.
 * @param line - a line the task pattern already matched.
 * @returns the line with `[x]` in place of its checkbox content.
 */
export function flipCheckbox(line) {
  const match = TASK_LINE_PATTERN.exec(line)
  if (match === null) return line
  const open = line.indexOf('[', match.index)
  if (open === -1) return line
  const close = line.indexOf(']', open + 1)
  if (close === -1) return line
  return `${line.slice(0, open + 1)}x${line.slice(close)}`
}

/**
 * Replace one line while preserving every other byte and the file's line
 * endings (splitting on `\n` leaves a CRLF file's `\r` at the end of each line).
 * @param content - the file's text.
 * @param lineNumber - 1-based line to replace.
 * @param nextLine - replacement text.
 * @returns the new file text.
 */
export function replaceLine(content, lineNumber, nextLine) {
  const lines = content.split('\n')
  if (lineNumber < 1 || lineNumber > lines.length) {
    throw new Error(`Line ${lineNumber} is outside the file's ${lines.length} lines.`)
  }
  lines[lineNumber - 1] = nextLine
  return lines.join('\n')
}

/**
 * Find the task a caller named, preferring a pending duplicate.
 * @param tasks - candidate tasks, in document order.
 * @param taskId - numeric id (`2.3`), or `#N` for an unnumbered task.
 * @param hint - optional source path and line returned by the previous tool call.
 * @returns the matching task, or null.
 */
export function findTask(tasks, taskId, hint = {}) {
  if (typeof taskId !== 'string' || taskId === '') return null
  const described = tasks.filter((task) => task.description.length > 0)
  if (hint.sourcePath !== undefined && hint.line !== undefined) {
    const atLine = described.find(
      (task) => task.sourcePath === hint.sourcePath && task.line === hint.line,
    )
    if (atLine !== undefined && matches(atLine, taskId)) return atLine
  }
  if (taskId.startsWith('#')) {
    const id = taskId.slice(1)
    return described.find((task) => task.id === id) ?? null
  }
  const numeric = described.filter((task) => task.numericId === taskId)
  if (numeric.length > 0) {
    return numeric.find((task) => !task.done) ?? numeric[0]
  }
  // The CLI's `id` is a plain 1-based index. Accept it as a fallback so a
  // caller can address a task whose description has no numeric prefix.
  return described.find((task) => task.id === taskId) ?? null
}

/**
 * Whether a task answers to the caller's id.
 * @param task - candidate task.
 * @param taskId - numeric id or `#N`.
 * @returns true when the task's key matches.
 */
function matches(task, taskId) {
  if (task.numericId === taskId) return true
  if (taskId.startsWith('#')) return task.id === taskId.slice(1)
  return false
}

/**
 * Project one task into the model-facing `next` object.
 * @param task - a task with a concrete `sourcePath`.
 * @returns the bounded next-task payload.
 */
export function describeTask(task) {
  const truncated = task.description.length > MAX_DESCRIPTION
  return {
    id: taskKey(task),
    description: truncated
      ? `${task.description.slice(0, MAX_DESCRIPTION)}…`
      : task.description,
    sourcePath: task.sourcePath,
    line: task.line,
    ...(truncated ? { descriptionTruncated: true } : {}),
  }
}
