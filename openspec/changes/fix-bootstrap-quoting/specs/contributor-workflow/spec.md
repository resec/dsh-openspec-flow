# Spec Delta

## ADDED Requirements

### Requirement: Bootstrap forwards arguments as whole words

The shell bootstrap entrypoint SHALL forward every argument it does not consume to `scripts/bootstrap.mjs` as exactly one argument. An argument SHALL keep its spaces, and an option SHALL keep the value bound to it, whether the argument precedes the `--` separator or follows it.

#### Scenario: An argument contains a space

- **WHEN** bootstrap is invoked with an argument such as `"a b"`, with or without the `--` separator
- **THEN** `scripts/bootstrap.mjs` receives `a b` as one argument

#### Scenario: An option value contains a space

- **WHEN** bootstrap is invoked with `--playwright-host "https://mirror.example/a b"`
- **THEN** the entrypoint receives the option and that whole value as two arguments
