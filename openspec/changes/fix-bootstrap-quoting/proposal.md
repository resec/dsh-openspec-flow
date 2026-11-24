# Proposal

## Why

`scripts/bootstrap.sh` collects the arguments it does not handle into one space-separated string and expands that string unquoted when it execs `scripts/bootstrap.mjs`. The shell then splits the expansion on whitespace, so a value containing a space arrives as several arguments: `sh scripts/bootstrap.sh -- "a b"` reaches the entrypoint as `a` and `b`, and `--playwright-host "https://mirror.example/a b"` reaches it as the option plus `https://mirror.example/a` and a stray `b`. The options this entrypoint documents, including `--playwright-host` and `--registry`, take values, so their values cannot be relied on.

## What Changes

- Move the arguments the shell does not consume to the tail of the positional parameters with `set -- "$@" "$arg"`, which keeps each one a single word, and exec `scripts/bootstrap.mjs` with `"$@"`.
- Drop the `PASSTHROUGH` string and its `SC2086` suppressions, which existed only to allow the splitting.
- Cover both passthrough paths, before and after the `--` separator, with an argument containing a space, and cover an option whose value contains a space.

The option set and its semantics stay as they are; `--skip-install`, `--full` and the rest still reach the entrypoint unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contributor-workflow`: adds a requirement that the shell entrypoint forwards each argument as exactly one word. The capability named the bootstrap options and their effects but never stated argument boundaries, so the requirement is new rather than a correction to existing text.

## Impact

- `scripts/bootstrap.sh`: the argument loop and the three `exec` lines.
- `test/bootstrap.test.mjs`: two tests that run the shell entrypoint.
- No change to `scripts/bootstrap.mjs`, its options, the documented usage, dependencies, workflows, hooks, `coverage.baseline.json` or `dist/`.
