# The gate a change has to pass, run on your own machine.
#
# There is no hosted CI: these targets are the checks, and `make ci` is what a
# pull request is expected to have passed before it is merged. Nothing runs them
# for you — no hook, no watcher. Run them when you want to know.
#
#   make ci          everything below except smoke: the PR gate
#   make format      rustfmt --check over the Rust half, first because it takes seconds
#   make smoke       the development loop: rustfmt, unit + contract, cargo test, the @smoke app specs
#   make lint        the mechanically checkable hard rules (scripts/verify-hygiene.ts)
#   make typecheck   every tsconfig, against a fresh build
#   make test        the node suite, every tier, against a fresh build
#   make e2e         the browser layer: WebKit and Chromium (Playwright)
#   make rust        the app's Rust half: fmt, clippy -D warnings, cargo test, bindings
#
# Each target starts where a clean checkout would: dependencies installed exactly
# as locked, and no `dist/` left over from an earlier build (see `build`). That is
# what makes a local pass mean the same thing everywhere.
#
# `make ci` does that once for all of them, then runs the browser layer, which
# is most of its time, beside rust (see `ci`).
#
# What is NOT here is the real app under WebDriver (`pnpm test:app`, layer 4).
# It needs a logged-in macOS session with a WindowServer (ADR 0014,
# TEST_ARCHITECTURE.md §6) and stays a manual gate, run when the app shell changes.

SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

.PHONY: help ci format install build lint typecheck test smoke e2e rust rust-inputs check-node

help:
	@sed -n 's/^#   make /make /p' $(MAKEFILE_LIST)

# Everything that writes into the tree (the install, `dist/`, the capture helper,
# the built page) happens first and once. What is left only reads it, so the
# browser layer, which is most of the gate's time, runs beside the Rust half:
# PREPARED tells the targets their inputs are in place (see `install`). Lint and
# typecheck stay ahead of both, because a check that fails in seconds should
# say so in seconds. So does the node suite: its jsdom tier waits real
# milliseconds for the editor to settle, and fails when a browser run takes the
# machine from under it. The browser layer prints as it goes; the Rust half is
# kept in a log and printed whole when both are done, so neither output cuts
# through the other. One recipe line, because the job in the background and its
# `wait` need one shell.
ci: format lint typecheck test rust-inputs
	@log=$$(mktemp "$${TMPDIR:-/tmp}/piary-ci.XXXXXX"); status=0; \
	$(MAKE) --no-print-directory PREPARED=1 rust >"$$log" 2>&1 & side=$$!; \
	trap 'kill $$side 2>/dev/null || true' INT TERM; \
	$(MAKE) --no-print-directory PREPARED=1 e2e || status=$$?; \
	echo "make ci: rust, which ran beside the browser layer:"; \
	wait $$side || status=$$?; \
	cat "$$log"; rm -f "$$log"; \
	if [ $$status -ne 0 ]; then echo "make ci: a check failed"; exit $$status; fi; \
	echo "make ci: every check passed"

# `engines` requires >=22.18 for native type stripping: the Node half of the repo
# runs `.ts` unbuilt, so an older Node meets it as a syntax error (ADR 0012).
# Checked first, so a failure is the code's and not the machine's.
check-node:
	@node -e 'const [a, b] = process.versions.node.split(".").map(Number); if (a < 22 || (a === 22 && b < 18)) { console.error(`Node ${process.versions.node} is too old: 22.18 or newer is required (ADR 0012)`); process.exit(1); }'

# `make ci` runs these once and then passes PREPARED=1 to the targets it runs
# beside each other: a second `rm -rf dist` there would empty the build under a
# running suite.
ifdef PREPARED
install build rust-inputs:
	@:
else

# --frozen-lockfile: what is tested is what is locked, not whatever a fresh
# resolve picks today. Fast when nothing changed.
install: check-node
	pnpm install --frozen-lockfile

# `dist/` is an input, not just an output: test files import the build artifact
# rather than `src/` (ADR 0006 — the suite drives what ships), and
# tsconfig.node.json includes `tests/**/*.ts`. A `dist/` left from an earlier
# build can hold a module whose source was deleted, and a test importing it would
# pass here while a clean checkout fails — so it is removed before every build.
build: install
	rm -rf dist
	pnpm build

# What the crate cannot compile without (see `rust`), checked for and built.
# `app:page` is the page alone: `build` has just made the `dist/` it is built on.
rust-inputs: build
	@if [ "$$(uname -s)" != "Darwin" ]; then echo "make rust: the app's Rust half builds on macOS only (ADR 0014)"; exit 1; fi
	@command -v swiftc >/dev/null || { echo "make rust: swiftc is required to build the capture helper (Xcode command line tools)"; exit 1; }
	@cargo fmt --version >/dev/null 2>&1 && cargo clippy --version >/dev/null 2>&1 || { echo "make rust: rustfmt and clippy are required: rustup component add rustfmt clippy"; exit 1; }
	pnpm sidecar:build
	pnpm app:page

endif

# Build-free on purpose: verify-hygiene.ts walks the sources and skips `dist/`.
lint: install
	pnpm lint

# Every config, because each catches a different mistake: `process` in a browser
# module, a DOM global in a Node module (ADR 0012).
typecheck: build
	pnpm typecheck

# `pnpm test` alone runs against whatever `dist/` already held — the single most
# common wasted debugging session in this repo (docs/HANDBOOK.md, Testing Rules).
test: build
	pnpm test

# The cheap tier, for every edit rather than every merge: what passes here is
# not yet what `make ci` passes. `pnpm test:smoke` builds `dist/` itself.
format:
	@cargo fmt --version >/dev/null 2>&1 || { echo "make format: rustfmt is required: rustup component add rustfmt"; exit 1; }
	cd src-tauri && cargo fmt --check

smoke: install
	pnpm test:smoke

# The browser layer (TEST_ARCHITECTURE.md L2.5): layout, focus and engine
# behaviour the jsdom suite structurally cannot see. Only the two engines the
# specs declare are installed; on Linux, `--with-deps` adds the system libraries a
# headless browser needs.
#
# CI=1 is the strict mode `playwright.config.ts` defines: `.only` fails the run,
# a spec gets one retry, and the dev servers are always started fresh rather
# than reused — a server left running from earlier work could otherwise be
# testing yesterday's code. The config bundles the harness itself, on top of
# `dist/`, so `build` comes first, and E2E_DIST_BUILT tells the config that
# `dist/` is this run's own and needs no second build.
e2e: build
	pnpm exec playwright install $(if $(filter Linux,$(shell uname -s)),--with-deps) webkit chromium
	CI=1 E2E_DIST_BUILT=1 pnpm test:e2e

# The app's Rust half: the PTY, the document store, the session relay, the
# capture helper's lifetime, window geometry. macOS only, and not by preference:
# `bundle.externalBin` names the Swift capture helper and `tauri-build` resolves
# it while generating the context, so without `swiftc` the crate does not
# compile at all. The helper and the page are built first because both are
# build inputs (`externalBin`, `frontendDist`): that is `rust-inputs`.
# `verify:rust` is fmt, clippy -D warnings, the Rust suite, and the check that
# src/bridge-types.ts matches what ts-rs regenerates.
rust: rust-inputs
	pnpm verify:rust
