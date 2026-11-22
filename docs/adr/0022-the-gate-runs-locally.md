# ADR 0022 — The gate runs locally: `make ci`, no hosted CI, no hooks

**Status:** accepted. Replaces `.github/workflows/verify.yml`, which is removed.

## Context

Every push ran five GitHub Actions jobs: `lint`, `typecheck`, `test`, `e2e` and
`rust` (the last on a macOS runner, because the crate needs `swiftc` to build).
The project decided to stop depending on hosted CI. What has to survive is not
the runner but the guarantee: a pull request is merged only once the same five
checks have passed, starting from the same place — dependencies exactly as
locked and no build output left over.

## Decision

**The checks are `make` targets, and `make ci` is the pull request gate.** One
target per former job — `make lint`, `make typecheck`, `make test`, `make e2e`,
`make rust` — each doing what its job did, from where its job started:

- **A frozen-lockfile install first**, every time. `pnpm-workspace.yaml` pins a
  dependency graph around a broken registry resolution, and a fresh resolve
  breaks it.
- **`dist/` is emptied before every build.** A runner started with no `dist/`.
  A machine that has built before can hold a module whose source was deleted,
  and a test importing it passes locally while a clean checkout fails.
- **The browser layer runs in the config's strict mode** (`CI=1`): `.only` fails
  the run, a spec gets one retry, and the dev servers are always started fresh
  rather than reused from earlier work.
- **The Node version is checked before anything runs** (22.18, ADR 0012), so a
  failure is the code's and not the machine's.

**Nothing runs them automatically.** No pre-commit or pre-push hook, no watcher:
a contributor runs `make ci` when they want to know, and says in the pull
request that it passed. A hook decides *when* a check runs for you; this
project wants that decision to stay the contributor's.

The reasoning each job's YAML carried — why `dist/` is an input, why `rust` is
macOS-only, why the lockfile is frozen — moved into the `Makefile` beside the
target it explains.

## Consequences

- **A pass is the contributor's word, not a runner's record.** A pull request
  description says `make ci` passed; the reviewer can run it too. There is no
  status check on the pull request page.
- **`make rust` needs a Mac with the Xcode command line tools**, as the job's
  runner did. On another platform it stops with that message rather than a
  compiler error.
- **The real-app layer is unchanged:** `pnpm test:app` was never in hosted CI
  and stays a manual gate (TEST_ARCHITECTURE.md §6).
- **Bringing hosted CI back is one small file:** a workflow whose jobs call the
  `make` targets would reproduce today's gate exactly, because the targets are
  the gate.
