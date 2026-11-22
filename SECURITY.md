# Reporting a security problem

Write to **hello@divergenz.ch** with what you found and how to reproduce it. Please do not
open a public issue for it.

You will get an answer saying whether it is taken as a vulnerability and what happens next.
Piary is an early release with no fixed release schedule, so there is no promised time to a
fix; a fix lands on `main`.

## What is worth knowing

- Piary runs the `pi` agent on your machine with your own credentials, in the directory the
  app was launched from. What the agent may do there is pi's to bound, not Piary's.
- The app's page can reach the machine only through the commands in
  `src-tauri/src/commands.rs`. A way for document content to call one it should not is a
  vulnerability.
- The camera's picture never leaves the page that reads it (`docs/adr/0058-the-face-is-read-in-the-page-and-only-words-leave-it.md`). A path by
  which a frame, or the numbers read from it, is stored or sent other than as the `[face]`
  block of a message is a vulnerability.
- Builds made for testing (`--features e2e`) open an unauthenticated WebDriver server on a
  local port. They are not for use, and are not what `pnpm app:bundle` makes.
