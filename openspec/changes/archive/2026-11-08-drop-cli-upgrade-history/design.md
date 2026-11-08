# Design: Drop the upgrade history from the CLI upgrade guide

## Context

See `proposal.md` - Why. The guide is a procedure document; a later upgrade rewrote its `版本示例` section into a `版本对照` section that records the 1.16.1 upgrade, and its contract-check section kept that upgrade's dated run. The pinned CLI is still 1.16.1, so the record and the instructions currently agree, but they will diverge at the next pin move.

## Goals / Non-Goals

Goals:

- Every paragraph either states the procedure or describes the current pin.
- The current pin, the CLI coupling inventory and the file:line references remain accurate and checkable.
- Examples stay executable without naming a past upgrade.

Non-Goals:

- No change to the contract check, the test matrix, the coupling inventory, tool code, tests, skills or the dependency.
- No new worked example written into the guide.

## Decisions

**Classify by durability.** A statement belongs in the guide when it stays true until the next pin move (procedure, current pin, coupling inventory); it is removed when it describes one completed upgrade (version-to-version comparison, dated measurement, before/after behavior). Rationale: the guide is read to run the next upgrade, not to reconstruct the last one. The removed evidence already lives in the archived change that performed the upgrade.

**Keep the working-tree snapshot marker.** The baseline and the sources section keep their `（2026-11-08 工作树）` qualifier. Rationale: the guide cites `file:line` positions, which are only checkable against a stated snapshot; the marker describes the current state the guide was checked against, not a past upgrade. Alternative considered: drop the dates; rejected because the line references would lose their only provenance.

**Keep current-pin version strings in the coupling table and edit steps.** Entries such as `skills/*/SKILL.md:7` → `openspec@1.16.1` name the content an upgrade must change. Rationale: they are edit targets, not history; removing them would make the inventory unusable.

**Use the `<version>` placeholder in contract-check examples.** Rationale: a concrete candidate equal to the current pin is a leftover of the last run and misleads a maintainer into thinking the candidate must differ from the pin in a specific way. The sources section links the Releases index instead of two fixed tags for the same reason.

**Do not touch the archived change.** The task that once asked for the record stays in the archive as history; the new spec scenario governs future updates.

## Risks / Trade-offs

- [The guide loses its only worked example of a completed upgrade] → The procedure, the contract-check usage and the test matrix still show every step; the archived change holds the worked case.
- [Snapshot dates read as history] → They qualify the baseline and the sources, both of which describe the current state; the removed section was the only place narrating the upgrade itself.
- [Prose still hints at a past upgrade after the obvious sections are removed] → The final task reads the whole guide and checks that no sentence describes a completed upgrade's changes or measurements.

## Migration Plan

Documentation edit only; no runtime or data migration. Rollback is a revert of the documentation commit, which restores the removed sections.

## Open Questions

None.
