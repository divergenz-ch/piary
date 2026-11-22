# ADR 0011 — Credentials fail visibly rather than gating the app

**Status:** accepted.

## Context

The point of a first run is that a reader can **perform** the interaction rather than watch it. That
is defeated in two different ways:

- **A gate.** "Sign in to continue" in front of the canvas means the person who came from a link
  leaves without seeing anything. The entire value is the first prompt.
- **A silence.** An interface that accepts a prompt and then does nothing — empty model picker, no
  response, no error — reads as broken software.

Both are reachable, because a credential can be absent.

## Decision

**Degrade visibly; never gate.** With no credential the app still opens, and the first prompt fails
in the open, with a way to sign in under it.

## Consequences

- "Fails visibly" is a product requirement, so it is a UI obligation: a failure must reach the
  user as a message — the status line or the document — never a console line. The same holds for
  every other failure the app can name: a refused save, a model pi would not take, a program that
  did not start.

## Lessons

- **A gate and a silence are the two ways a first run fails, and they pull in opposite
  directions.** Choosing which one you will never ship — here, the gate — is what makes the other
  one's handling a requirement instead of an afterthought.
