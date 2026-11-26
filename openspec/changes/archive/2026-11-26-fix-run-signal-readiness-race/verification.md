# Verification

Measurements for the readiness handshake, taken on Node v24.22.2.

## Loaded single core

Before the change, on `main` at commit `5307241`: the
`the child survives the ignored SIGTERM` assertion failed in 8 of 10 runs,
with the run pinned to one core beside six busy-loop processes.

After the change, with the same load and the same ten runs: 0 of 10 runs
failed.

```sh
for i in 1 2 3 4 5 6; do
  taskset -c 0 node -e 'const t=Date.now(); while(Date.now()-t<150000){}' &
done
for i in $(seq 1 10); do taskset -c 0 node --test test/run-signal.test.mjs; done
```

## A reintroduced fixed wait

The test child installs its handler 500 ms after it starts, so the handshake
is load-bearing rather than only a load-dependent improvement. Signalling
that child 80 ms after the spawn, as the previous version did, killed it in
5 of 5 trials on an idle host; waiting for its readiness line kept it alive
in 5 of 5.

## Commands

- `node --test test/run-signal.test.mjs`: 11 tests pass on an idle host.
- `npm run verify`: the suite and the coverage gate pass on the committed
  tree; the apply review records the coverage summary.
