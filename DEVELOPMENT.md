# Development

This document is for contributors to tikz-editor.

## Architecture

The core library uses a layered pipeline:

1. **Parser** (`packages/core/src/parser`) — Parses TikZ into a lossless AST with diagnostics
2. **Semantic Evaluator** (`packages/core/src/semantic`) — Resolves styles, transforms, coordinates, and path semantics into a scene graph
3. **SVG Backend** (`packages/core/src/svg`) — Emits pure SVG from scene elements
4. **Render API** (`packages/core/src/render`) — End-to-end source → SVG orchestration
5. **Text Engines** (`packages/core/src/text`) — Pluggable `NodeTextEngine` implementations that measure + render node text. The repo ships two:
   - `mathjax-engine.ts` — in-process MathJax; the sole engine used by the web build.
   - `native-tex-engine.ts` — desktop only. Wraps each fragment in a standalone `.tex` document, calls an injected compile function (`NativeTexCompileFn`), extracts a `viewBox` from the resulting SVG, and caches by hash of (fragment, preamble, working directory, referenced image mtimes). Compile failures cache a synthetic red-bordered error render, so the canvas shows an explicit failure indicator instead of silently falling back to raw source text.
   - `hybrid-engine.ts` — the routing wrapper: uses the native engine when one is provided, otherwise MathJax.
   - `native-tex-detect.ts`, `preamble-extract.ts` — support utilities (legacy: routing heuristic; current: preamble extraction + macro-name collection for cache keying).

## Apps

- **Web app** (`apps/web`) — Vite + React. Uses MathJax as the sole text engine (no local TeX toolchain in a browser).
- **Desktop app** (`apps/desktop`) — Tauri v2. Injects a native TeX compile function that shells out to `latex` + `dvisvgm` via `desktop_compile_tex_fragment` (see `apps/desktop/src-tauri/src/lib.rs`), then the hybrid engine routes ALL fragments through it (visible errors on failure). Also hosts the agent screenshot debug feature (`start_agent_screenshot_watcher` + `apps/desktop/src/agent-screenshot.ts`).

## Scripts

```bash
# Type checking
npm run typecheck

# Run all tests
npm test

# Capability matrix tests only
npm run test:capabilities

# PGF corpus regression tests
npm run test:corpus

# Web e2e tests (Playwright)
npm run test:e2e

# Web e2e tests in Firefox or WebKit
npm run test:e2e:firefox
npm run test:e2e:webkit
npm run test:e2e:all-browsers

# Desktop e2e tests
npm run test:desktop:e2e

# Build core package
npm run build

# Build web app
cd apps/web && npm run build
```

### Renderer Comparison Scripts

Compare our renderer against TeX reference output:

```bash
# Single snippet
npm run compare:renderers -- --input path/to/snippet.tex

# PGF manual snippets (generates side-by-side gallery)
npm run compare:pgf-docs -- --source-file pgfmanual-en-tikz-paths.tex
```

Outputs go to `artifacts/renderer-compare/`.

## Capability Matrix

Capabilities are tracked in:
- `packages/core/src/capabilities/feature-ids.ts`
- `packages/core/src/capabilities/matrix.ts`
- `packages/core/src/capabilities/registries.ts`

CI enforces capability drift via `test/capabilities.spec.ts`.

## Corpus

The repository includes `pgf-docs/`, a copy of the PGF manual source files used for testing and capability tracking. `pgf-src/` contains PGF source files for reference.

## Codespaces

`.devcontainer/devcontainer.json` runs `npm run codespaces:startup` on creation, which installs Tauri Linux dependencies and builds prerequisites.

## Profiling

Performance profiling is organized under `apps/web/profiling/` and exposed through scripts instead of ad hoc Playwright commands.

Run from the repo root:

```bash
npm run profile:web
npm run profile:web -- --scenario paper-drag
npm run profile:web -- --category canvas-edit
```

Run from `apps/web/` if you want the app-local entrypoint instead:

```bash
npm run profile
npm run profile -- --scenario scope-edit
npm run profile -- --category paper
```

Supported scenario ids:

- `actions`
- `basic-drag`
- `paper-selection`
- `paper-drag`
- `paper-color`
- `scope-edit`
- `dense-path-edit`
- `path-tool`

Supported categories:

- `actions`
- `basic-drag`
- `paper`
- `canvas-edit`

Artifacts are written to `apps/web/profiling/traces/`:

- `<scenario-id>-<variant-id>.cpuprofile`
- `<scenario-id>-report.json`

Set `TIKZ_PROFILE_VERBOSE=1` for verbose scenario logging.

Analyze or compare profiles:

```bash
npm run profile:web:analyze -- apps/web/profiling/traces/paper-drag-visible.cpuprofile --dist apps/web/dist
npm run profile:web:compare -- apps/web/profiling/traces/paper-drag-visible.cpuprofile apps/web/profiling/traces/paper-drag-hidden-both-panels.cpuprofile --dist apps/web/dist --app-only
npm run profile:web:compare-report -- apps/web/profiling/traces/paper-drag-report.json apps/web/profiling/traces/scope-edit-report.json
```
