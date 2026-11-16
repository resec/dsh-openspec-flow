# Spec Delta

## ADDED Requirements

### Requirement: A task's text is its whole first paragraph

`openspec_apply_next` SHALL project a task's text as the CLI pinned by `project-invariants` parses it, and `openspec_mark_task_done` SHALL resolve a task by that same text: the text after the checkbox plus every following line until a line that ends the paragraph, joined with a single space, with a trailing hard break removed. A continuation line MUST NOT count as a task.

#### Scenario: A wrapped task keeps one text

- **WHEN** a tracking file writes one task across several lines
- **THEN** the projected description and the parsed description join those lines with a single space
- **AND** the task count is unchanged

#### Scenario: A hard break is dropped

- **WHEN** a task's line ends with a trailing `\` and its text continues on the next line
- **THEN** the description joins the next line without the backslash

#### Scenario: A sibling checkbox ends the text

- **WHEN** a wrapped task is followed by another checkbox item
- **THEN** the task's text ends at that line
- **AND** the sibling counts as its own task

#### Scenario: Any other list item only ends the text

- **WHEN** a wrapped task is followed by a plain list item, a heading or a blank line
- **THEN** the task's text ends at that line
- **AND** that line is not a task

#### Scenario: An empty checkbox takes the continuation text

- **WHEN** the checkbox line carries no text and the next line does
- **THEN** the description is that next line's text
- **AND** the task is addressable like any other described task

#### Scenario: A wrapped task still resolves by its source line

- **WHEN** `openspec_apply_next` returns a wrapped task and `openspec_mark_task_done` looks it up by source path and line
- **THEN** the plugin's description matches the CLI's, so the task resolves at that line
