# Design: converge project invariants

## Context

See `proposal.md` - Why. Two constraints decide where the values can live:

- Archive carries only `## Purpose` and requirement blocks. Anything else in a delta is reported as unapplied content and dropped (specs-apply.js:157-160).
- A requirement description is capped at 500 characters; strict validation fails above it.

The three invariants fit the second constraint comfortably. The first one rules out every placement except requirement bodies and Purpose.

## Goals / Non-Goals

Goals:

- One place to learn a shared value.
- A stated rule that consumers reference it.
- No new file format, no new test, no new code.

Non-Goals:

- Automatic enforcement of the reference rule.
- Detecting semantic contradictions between requirements.
- Repairing the schema-gate tool list mismatch between `schema-compatibility` and `tool-surface`.

## Decisions

### Decision: values live in requirement text

Each invariant is one requirement in `project-invariants`; the value sits in the body, and a scenario exercises the behavior it drives.

Alternatives considered:

- **A JSON registry plus a test.** It buys machine comparison at the cost of a second file, a second copy and a test. Three values do not earn that, and the test cannot run before archive without an exemption.
- **A `## Registry` section in the delta.** Dropped at archive with a warning; it would never reach the main spec.
- **A table under `## Purpose`.** Purpose is narrative and is copied verbatim into every new main spec; it is the wrong place for data.

Requirements are the only container that survives archive, can be modified later, and is what review reads.

### Decision: the owner states numbers, consumers use indirection

`project-invariants` says `24`, `>=24.9.0`, `1.16.1`, `1`, `90/85/95`, `95/90/100` and `1 percentage point`. A consumer says "recorded in `project-invariants`" and never repeats the number. The owner is literal; consumers are symbolic.

### Decision: no machine check

The reference rule is enforced by review. Nothing fails when a consumer restates a value, and nothing fails when a spec silently drops its reference.

A check that reads main specs cannot pass before archive, because main specs change only at archive; the workarounds (scan the effective state, exempt capabilities with active deltas) add machinery disproportionate to three values. Stating the limitation is better than shipping an exemption nobody remembers.

### Decision: `schemaVersion` folds into the pin requirement

"accept only schema envelope version 1" is part of the pin requirement, not a separate line item. One value, one sentence.

## Risks / Trade-offs

- **A consumer can restate a value and nothing notices** → the review question is written into `README.md` and `AGENTS.md`; the rule is a convention, not a guarantee.
- **The spec and `package.json` can diverge silently** → the spec is authoritative by convention; an audit can compare them, but nothing runs it.
- **Prose is harder to grep than a JSON key** → acceptable at three values; a fourth or fifth is the signal to reconsider a registry.
- **The 500-character cap bounds how much one requirement can carry** → an invariant that needs a table must be split into several requirements.

## Migration Plan

One commit inside this change: rewrite the delta specs, point `README.md` and `AGENTS.md` at the capability, and delete the registry prototype from the earlier draft. No data or dependency migration. Rollback is a revert.
