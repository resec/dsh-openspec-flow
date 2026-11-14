# Fix the reviewer preset tool config

## Why

DSH 0.2.2-rc.2 makes `sampleOverCapGlobResults` a required field of `@deepseek-ai/dsh-tool-fs-search`, with no fallback. The bundled `dsh-base` patch configures it, but this plugin's `openspec-reviewer` preset mounts the same tool with no config. Activating an independent reviewer therefore fails before the reviewer session starts:

```text
tool-fs-search (@deepseek-ai/dsh-tool-fs-search): invalid config:
  - $.sampleOverCapGlobResults missing required value
```

Every change whose policy sets `reviewers: 1` cannot start a draft or apply review until this is fixed. Pending no-git apply-review work is blocked on it, and the profile's configured default is `reviewers: 1`.

## What Changes

- Add `config.sampleOverCapGlobResults: false` to the `tool-fs-search` row inside the `openspec-reviewer` preset in `cordis.patch.yml`, matching the value used by `dsh-base`.
- Extend the existing preset test in `test/review.test.mjs` to assert the field is present under the preset's fs-search row, alongside the existing read-only and export assertions.
- Record the runtime compatibility contract in a `tool-surface` delta: the reviewer preset SHALL activate on the pinned DSH runtime, and each child tool SHALL satisfy that runtime's required configuration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-surface`: the reviewer preset must activate with the tool configuration the pinned DSH runtime requires; a missing required tool setting fails activation before the reviewer starts.

## Impact

- `cordis.patch.yml`: one nested config key.
- `test/review.test.mjs`: one assertion.
- `openspec/changes/fix-reviewer-preset-config/specs/tool-surface/spec.md`: one added requirement.
- No dependency, `engines.dsh`, tool schema, prompt, skill or documentation change.
- The preset row must be re-activated (plugin reload or DSH restart) before the running profile uses the fixed config; an independent reviewer start after the reload is the live verification.
