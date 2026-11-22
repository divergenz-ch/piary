# Contributing

Piary is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE). A change
you send is offered under the same licence.

## Before you start

- **A bug:** open an issue with what you did, what you saw and what you expected. A document
  that shows it is the best report: a conversation is one markdown file.
- **A change to how the canvas behaves:** open an issue first. The interaction is specified,
  and a better idea about it is a conversation before it is a pull request
  (`docs/adr/0010-frozen-prototype-specification-is-the-code.md`).
- **Anything else** (a fix, a test, a document): a pull request is welcome as it is.

## How a change is checked

There is no hosted CI. The gate is `make ci`, run on your own machine before a pull request is
merged; `README.md` lists what it runs. While you work, `pnpm test:smoke` is the fast loop.

A fix comes with the test that failed before it. `docs/TEST_ARCHITECTURE.md` says which layer
a test belongs in, and `docs/CODING_GUIDELINES.md` holds the rules the code is held to.

## Conventions

- Commit messages are [Conventional Commits](https://www.conventionalcommits.org) with a
  scope, and the subject says what changed for the user: `fix(app): a request the provider
  refused says why, instead of an empty answer`.
- A change to the document format updates `docs/document-format.md` or
  `docs/notebook-cells.md` and its test in the same pull request.
- A significant decision gets a record in `docs/adr/`. Read `docs/adr/README.md` before
  changing architecture.
- No new runtime dependency without agreement in an issue first.

## What runs on your machine

Piary runs your own `pi`, with your own credentials. The real-model test and the evals spend
calls on your account; `PI_E2E_DISABLED=1` turns the one in `pnpm test:app` off.
