# Spec Delta: pr-review-pipeline

## MODIFIED Requirements

### Requirement: Retry boundary

The open list, the fallback scalar list, the per-pull-request inspection or detail read and the reconcile and preflight reads SHALL be retried when they fail with a transient gateway error: an HTTP 5xx response, a gateway timeout, a reset connection or a request killed by its deadline. The update-branch request, the head poll after an update, a merge, a comment and a label write SHALL keep single-shot semantics, and a failure that is not transient SHALL be reported without a retry.

#### Scenario: A transient read failure is retried once

- **WHEN** a list, scalar-list, inspection, detail, reconcile or preflight read fails with a transient gateway error
- **THEN** the command retries that read under the shared read policy and uses the rows it returns

#### Scenario: The update-branch request is never retried

- **WHEN** the update-branch request fails with a transient gateway error
- **THEN** the batch reports the refusal for that pull request and sends no second update request

#### Scenario: A non-transient failure is reported without a retry

- **WHEN** a request fails with an unauthenticated, usage or malformed-response error
- **THEN** the command reports the error and makes no retry attempt

### Requirement: Unavailable batch list

When the open list still fails after its read attempts, the batch SHALL report an unavailable outcome with `unavailable: true` and `changed: false`, write no `syncs` record, update no branch and create no landing entry, and SHALL exit successfully so the scheduled run continues to the landing or review step.

#### Scenario: A gateway failure leaves the list unavailable

- **WHEN** the list request fails with a transient gateway error on every read attempt
- **THEN** the batch reports `unavailable: true` with `changed: false`

#### Scenario: An unavailable batch changes nothing

- **WHEN** the list is unavailable
- **THEN** no branch is updated, no `syncs` entry is recorded and no landing entry is created

#### Scenario: An unavailable batch does not stop the run

- **WHEN** the list is unavailable
- **THEN** the command exits successfully and the run continues to the landing or review step so reviews remain available

### Requirement: Poll retry and fallback

The poll SHALL retry its transiently failing full-detail list request under the shared read retry policy. When it still fails, the poll SHALL read a scalar list plus one detail request per pull request that needs evaluation, report the same candidates as the full-detail read and mark the result `fallback: true`. A remaining scalar-list or detail failure SHALL fail the poll instead of reporting a partial candidate list.

#### Scenario: A transient list failure is retried

- **WHEN** the full-detail list request fails once with a gateway error
- **THEN** the poll retries it under the read policy and reports its candidates without the fallback marker

#### Scenario: The fallback reports the same candidates

- **WHEN** the full-detail request fails on every read attempt
- **THEN** the poll reports the candidate numbers the full-detail read would report

#### Scenario: The fallback is marked

- **WHEN** the fallback serves the poll
- **THEN** the result carries `fallback: true`

#### Scenario: The fallback skips no eligible row

- **WHEN** the fallback evaluates the scalar list
- **THEN** every row is either given a detail request or skipped by the same recorded-head rule the full-detail read applies

#### Scenario: A partial candidate list is not reported

- **WHEN** the scalar list or any detail request remains unavailable after its read attempts
- **THEN** the poll fails and reports no candidate list

## ADDED Requirements

### Requirement: Read retry policy

A transiently failing read SHALL receive at most three attempts in total with a short backoff between attempts. The read deadline and the attempt count SHALL default to 20 seconds and three attempts, and SHALL be overridable by environment variables within documented bounds.

#### Scenario: A read stops after three attempts

- **WHEN** a read fails transiently on every attempt
- **THEN** the command stops after the third attempt and reports the failure

#### Scenario: A request killed by its deadline is transient

- **WHEN** a read is killed because it exceeded its deadline
- **THEN** the command treats it as a transient failure and retries it under the policy

#### Scenario: An override outside its range falls back to the default

- **WHEN** a deadline or attempt override falls outside its documented range
- **THEN** the command uses the documented default instead of the override

### Requirement: Batched owner-review reads

Reconcile SHALL read the authenticated login at most once per run, SHALL screen tracked pull requests from one lightweight open list, and SHALL read mergeability, merge state and recent comments in chunks of at most 25 pull requests per request. A chunk that stays unavailable after its attempts SHALL be re-read one pull request at a time, and a single pull request's failure SHALL be reported without aborting the others.

#### Scenario: Bounded reads for a large tracked set

- **WHEN** 85 tracked pull requests need a decision
- **THEN** reconcile issues one login read, one lightweight open list and at most four detail requests

#### Scenario: Batched and per-pull-request reads agree

- **WHEN** a pull request is evaluated once from a detail chunk and once from its own detail read
- **THEN** reconcile reaches the same action, reason and recorded head for both reads

#### Scenario: A failed chunk falls back to per-pull-request reads

- **WHEN** a detail chunk fails transiently on every attempt
- **THEN** each pull request in that chunk is read individually and its action is reported

#### Scenario: One pull request failure does not abort reconcile

- **WHEN** one pull request's read fails after its attempts
- **THEN** the remaining pull requests are still evaluated and the failure is listed for that pull request

#### Scenario: A changed head reads its files

- **WHEN** a tracked pull request's head differs from its recorded head
- **THEN** its changed files are read before the active-change gate decides, instead of trusting the recorded change

### Requirement: Run lock recovery

The run lock SHALL record the owner PID and its process start time. A command SHALL reclaim the lock when the owner PID is gone or its recorded start time no longer matches, SHALL reclaim a corrupt owner file only when the lock is older than ten minutes, and SHALL refuse and report the owner when a live process with the matching start time holds it. A reclaim SHALL be reported as `stale-lock-reclaimed`.

#### Scenario: A killed run no longer blocks the next one

- **WHEN** the recorded owner PID no longer exists
- **THEN** the next command reclaims the lock and proceeds with its work

#### Scenario: A reused PID is not a live owner

- **WHEN** the recorded PID belongs to a process whose start time differs from the recorded start time
- **THEN** the command reclaims the lock and proceeds

#### Scenario: A live owner still refuses the run

- **WHEN** the recorded PID is alive with the matching start time
- **THEN** the command exits, reports the owner, and changes nothing

#### Scenario: A lock without identity ages out

- **WHEN** the owner file predates the identity fields and the lock is older than ten minutes
- **THEN** the command reclaims the lock and proceeds

#### Scenario: Two commands reclaim one stale lock

- **WHEN** two commands find the same stale lock at the same time
- **THEN** exactly one reclaims it and the other refuses with the owner that claimed it

#### Scenario: A reclaim is reported

- **WHEN** a stale lock is reclaimed
- **THEN** the command prints `stale-lock-reclaimed` with the previous owner PID and timestamp and still produces its normal result

### Requirement: Preflight probe deadline

`preflight` SHALL probe GitHub reachability with at most two attempts under a five-second deadline each and SHALL bound the base-branch fetch with a 30-second deadline. It SHALL report `github-unreachable` or `origin-unreachable` within those bounds instead of waiting for a platform connect timeout.

#### Scenario: A stalled probe reports offline quickly

- **WHEN** the reachability probe is killed by its deadline on both attempts
- **THEN** the preflight reports `github-unreachable` within about ten seconds and the session stops pull-request work

#### Scenario: The second attempt recovers

- **WHEN** the first probe attempt fails transiently and the second succeeds
- **THEN** the preflight reports GitHub online

#### Scenario: A stalled fetch stops landing

- **WHEN** the base-branch fetch exceeds its deadline
- **THEN** the preflight reports `origin-unreachable` and the session stops landing

### Requirement: Run telemetry

Each watch, owner-review and landing command that takes the run lock SHALL append one line to `.cache/pr-review/runs.jsonl` holding its timestamp, command name, duration, GitHub call count, transient failure count and outcome, and `state --cleanup` SHALL keep the most recent 2000 lines. A command that takes no run lock — `preflight`, the plain `state` view and the landing `state` command — SHALL write none. Telemetry SHALL NOT alter a command's standard output or JSON result.

#### Scenario: A finished command records one line

- **WHEN** a watch, owner-review or landing command that takes the run lock finishes
- **THEN** one JSON line with those fields is appended to `.cache/pr-review/runs.jsonl`

#### Scenario: The commands without the run lock write no telemetry

- **WHEN** `preflight`, the plain `state` view or the landing `state` command runs
- **THEN** it appends no telemetry line and its output is unchanged

#### Scenario: Cleanup keeps the most recent lines

- **WHEN** cleanup runs and the telemetry file holds more than 2000 lines
- **THEN** only the most recent 2000 lines remain

#### Scenario: Telemetry changes no output

- **WHEN** a command records telemetry
- **THEN** its standard output and its `--json` result equal the result a run without telemetry produces
