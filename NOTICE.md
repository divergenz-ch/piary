# What Piary ships that others wrote

Piary itself is under the [PolyForm Noncommercial License 1.0.0](LICENSE). The parts below
are other people's work, under their own licences, which that licence does not change.

## Files in this repository

| What | Where | Licence |
| --- | --- | --- |
| Noto Sans and Noto Serif, the canvas's two faces | `src/styles/fonts/` | SIL Open Font License 1.1 (`OFL-NotoSans.txt`, `OFL-NotoSerif.txt` beside the files) |

## Fetched when the app is built, and shipped inside it

| What | From | Licence |
| --- | --- | --- |
| MediaPipe Face Landmarker model, `face_landmarker.task` | Google's model storage, held to a checksum (`scripts/face-assets.ts`) | Apache-2.0 |
| MediaPipe's WebAssembly runtime | the `@mediapipe/tasks-vision` package | Apache-2.0 |
| pi, the coding agent, as its standalone build for each architecture | pi's releases, held to a checksum (`scripts/pi-bundle.ts`); a release build only | MIT (`src-tauri/licences/pi-LICENSE.txt`, shipped beside it) |

## Libraries built into the app's page

The versions are the ones in `pnpm-lock.yaml`; each package carries its own licence text.

| Package | Licence |
| --- | --- |
| `@a2ui/lit`, `@a2ui/web_core` | Apache-2.0 |
| `@codemirror/*`, `@lezer/highlight` | MIT |
| `@earendil-works/pi-agent-core`, `pi-ai`, `pi-coding-agent` | MIT |
| `@mediapipe/tasks-vision` | Apache-2.0 |
| `@observablehq/notebook-kit`, `@observablehq/plot` | ISC |
| `@tauri-apps/api` | Apache-2.0 or MIT |
| `@xterm/xterm`, `@xterm/addon-fit` | MIT |
| `katex` (with its fonts) | MIT, and SIL Open Font License 1.1 for the fonts |
| `lit` | BSD-3-Clause |
| `lucide` | ISC |
| `marked` | MIT |
| `zod` | MIT |

## The Rust half

The crates the app is built from are listed with their versions in `src-tauri/Cargo.lock`, and
each names its licence in its own manifest. `cargo tree --manifest-path src-tauri/Cargo.toml`
prints them.

This list covers what is built into the app. It was written by hand from the packages'
manifests; where it and a package disagree, the package is right.
