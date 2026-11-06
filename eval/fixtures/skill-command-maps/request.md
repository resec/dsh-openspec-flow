# Feature request: remove skill command maps

The packaged workflow skills still embed a `## Command map` table and name
`openspec` CLI commands in their bodies. Remove that CLI mapping so the skill
text names only the plugin tools.

## Requirements

1. In every `skills/openspec-*/SKILL.md`, remove the entire `## Command map`
   section, including its table.
2. In the same files, remove backticked references to these CLI commands:
   `openspec list`, `show`, `validate`, `instructions`, `status`, `archive`,
   `new`, `init`, `update`, `store`, `context`, `schemas`. Replace each with the
   corresponding tool name or with prose; keep the frontmatter metadata
   (`metadata.generatedBy`) intact.
3. Add a test in `test/skills.test.mjs` that reads every packaged skill and
   asserts it contains neither `## Command map` nor a backticked CLI command.
4. Do not change `.dsh/skills`.
5. Do not add dependencies.

## Workflow

- Create the change as `remove-skill-command-maps` with a proposal, a spec
  delta for the `skill-documentation` capability, an optional design, and
  tasks.
- The user confirms the change name before creation and confirms the start of
  apply; do not edit implementation code before that.
- Before reporting completion, run
  `openspec_validate remove-skill-command-maps` and `node --test test/`, and
  report both.
