# TikZ Editor

**WYSIWYG editor for TikZ diagrams in LaTeX** — desktop app with a live
side-by-side canvas + source pane. Drag figure elements visually; the TikZ
source updates in place without disturbing formatting. Edit the source; the
canvas updates. Two-way sync throughout.

Compiles arbitrary node text via a real local TeX toolchain, so
`\includegraphics`, user-defined preamble macros, and other constructs a
JavaScript math renderer can't handle all render correctly in the canvas.

> This is a fork of [DominikPeters/tikz-editor](https://github.com/DominikPeters/tikz-editor)
> — MIT-licensed. All pre-existing editor functionality is preserved; this fork
> adds a native TeX text engine, an agent debug screenshot mechanism, and
> associated docs (see [What this fork adds](#what-this-fork-adds) below).

## Features

- **Visual canvas** with drawing tools: shapes, paths, curves, freehand, Bézier, rectangles, circles, and more
- **Live source editor** with TikZ syntax highlighting, autocompletion, and number scrubbing
- **Two-way sync**: edit visually or in code — changes reflect instantly in both views
- **Native TeX text engine** (desktop) — every node text compiled by local `latex` + `dvisvgm`; supports `\includegraphics` and user-defined preamble macros with visible error indicators on compile failure
- **Export** to SVG, PDF, or PNG
- **Import** from SVG, IPE, or PPTX
- **Multi-figure support** for documents with multiple TikZ pictures
- Native file dialogs and system clipboard integration
- AI assistant for help with TikZ
- Automatic updates

## What this fork adds

Everything the upstream editor does still works. Additions:

- **Native TeX rendering** (desktop). Node text is compiled by a real local `latex` + `dvisvgm` pipeline via a new Tauri command. Handles:
  - `\includegraphics[opts]{path}` inside nodes — images are compiled, base64-inlined into the SVG, rendered in place. Draggable like any other node.
  - User-defined preamble macros (`\newcommand`, `\renewcommand`, `\providecommand`, `\def`, `\gdef`, `\edef`, `\xdef`, `\DeclareMathOperator`) — the preamble is threaded into every compile, so macros expand correctly.
  - Compile failures render as visible red-bordered error boxes in the canvas (with the failure kind + first line of the message), instead of silently falling back to raw source text.
- **Agent debug screenshot** — file-triggered pixel-level canvas capture for coding agents driving the app for testing (see [Agent debug features](#agent-debug-features) below).
- **Tracked docs directory** (`docs/examples/`) with a tutorial `.tex` file exercising the new features.

## Native TeX rendering (desktop)

The desktop build uses a native TeX text engine as the primary renderer. Every
node text is compiled by a local `latex` + `dvisvgm` pipeline; the resulting
SVG is embedded in the canvas with any referenced image assets inlined as
base64 data URIs. Compile output is cached per-fragment (hash of source +
preamble + working directory + referenced image mtimes), so drag/reposition
operations never trigger a recompile.

If a fragment fails to compile — bad TeX, missing package, missing image,
missing TeX toolchain — the node renders as a red-bordered error box
containing the failure kind and message. Recovery: any edit to the fragment
or preamble changes the cache key and triggers a fresh compile automatically.

### Requirements

- A TeX distribution: **MacTeX** (macOS), **TeX Live** (Linux), or **MiKTeX** (Windows).
- **Ghostscript** — for raster-image embedding under `\includegraphics`. Auto-detected from Homebrew, `/usr/local`, `/opt/homebrew`, `apt`, and the standard Windows install prefixes. Override via the `LIBGS` env var if needed.

### Try it

Open **[`docs/examples/native-tex-features.tex`](docs/examples/native-tex-features.tex)** in the desktop app. Contains four figures exercising text macros, math macros, `\includegraphics`, and the three combined.

### Scope

This first release covers the *node text* level only — pgfplots and other
constructs living at the tikzpicture level are not yet routed. See
[DEVELOPMENT.md](DEVELOPMENT.md) for the architecture and the phased plan.

## Run from source (desktop app)

The fork has no pre-built downloads yet. Clone, install, and launch the
desktop dev build in a few minutes.

### Prerequisites

- **Node.js 18+** and **npm** — the build uses Node 26 in this fork's CI but any recent LTS works.
- **Rust toolchain** (for the desktop app) — install via [rustup.rs](https://rustup.rs) if not present.
- **A TeX distribution + Ghostscript** — see [Requirements](#requirements) above. Optional if you don't need native TeX rendering.

### Clone + install + run

```bash
git clone <this-fork-url>
cd tikz-editor
npm install                # ~2–5 min for the monorepo
npm run dev:desktop        # first launch: 3–5 min Rust build, then window opens
```

Later runs:

```bash
npm run dev:desktop        # ~5s incremental rebuild + launch
```

Edit Rust code (`apps/desktop/src-tauri/src/`) → auto-recompiles + relaunches. Edit TypeScript/React (`packages/`, `apps/desktop/src/`) → hot-reloads instantly.

### Build a proper installer

For a one-click installer instead of the dev launcher:

```bash
npm run build:desktop
```

Output goes to `apps/desktop/src-tauri/target/release/bundle/` — `.dmg` on macOS, `.msi` / `.exe` on Windows, `.AppImage` / `.deb` on Linux. Drag/install as normal.

### If a second instance is running

Tauri's single-instance plugin will exit the dev launcher cleanly (no window) if an existing app with the same bundle ID is already open. Quit any running instance before `npm run dev:desktop`.

## Agent debug features

Features intended for coding agents (Claude Code and similar) that drive the
app for testing, not for end-user workflows.

### Agent screenshot capture

File-triggered pixel-level PNG of the currently-rendered canvas. Uses the
WebView's own SVG rasterizer (the same rendering pipeline that paints to the
screen), so it is **cross-platform** (macOS / Windows / Linux) and needs no
OS-level Screen Recording permission — no TCC prompt ever fires.

**Flow for the agent** (paths shown are macOS `$TMPDIR`; the app exposes a
`desktop_agent_screenshot_paths` Tauri command that returns the resolved
paths on any host):

```bash
# 1. Trigger a capture
touch "$TMPDIR/tikz-editor-agent-screenshot-request"

# 2. Wait for the app to write the PNG. The app removes the trigger file
#    when the write is complete, so absence-of-trigger is a "done" signal:
while [ -f "$TMPDIR/tikz-editor-agent-screenshot-request" ]; do sleep 0.1; done

# 3. Read the result
open "$TMPDIR/tikz-editor-agent-screenshot.png"    # or feed to the agent
```

The written PNG captures the largest SVG element on the page (typically the
main canvas), at the current view's pixel dimensions × devicePixelRatio.
No app UI chrome — just the rendered figure.

Wiring lives in [`apps/desktop/src-tauri/src/lib.rs`](apps/desktop/src-tauri/src/lib.rs)
(`start_agent_screenshot_watcher`, `desktop_write_agent_screenshot`) and
[`apps/desktop/src/agent-screenshot.ts`](apps/desktop/src/agent-screenshot.ts)
(`installAgentScreenshotHandler`).

## Supported TikZ Features

The editor supports a wide range of TikZ constructs:

- **Shapes**: 25+ built-in shapes including rectangle, circle, ellipse, diamond, polygon, star, arrows, callouts, and more
- **Paths**: lines, curves, rectangles, circles, arcs, grids
- **Curves**: Bézier curves with control points
- **Trees**: child operations, tree layout, level/sibling styling
- **Matrices**: matrix nodes with cell alignment
- **Loops**: `\foreach` in all forms (statement, path, node)
- **Styling**: colors, line styles, fill patterns, shading, transforms
- **Node text**: arbitrary LaTeX via the native TeX engine (desktop) — `\includegraphics`, user macros, custom packages threaded through the preamble

Some features have partial support (decorations, graphs, plots). Advanced constructs like `let` operations are not yet implemented. Constructs at the tikzpicture level (`\begin{axis}` for pgfplots, etc.) are not yet routed to native TeX — deferred to a follow-up phase.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for build instructions, architecture overview, contribution guidelines, and the full script catalog (tests, capability matrix, corpus, profiling).

## License and attribution

MIT.

Fork of [DominikPeters/tikz-editor](https://github.com/DominikPeters/tikz-editor). All pre-existing functionality, tests, and architectural decisions are the upstream author's work — this fork's contribution is additive (native TeX engine, agent debug capture, associated docs). The upstream project is the source of truth for the base editor; run this fork specifically when you want the additive features listed above.
