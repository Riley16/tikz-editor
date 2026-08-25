# TikZ Editor

**WYSIWYG editor for TikZ diagrams in LaTeX**

You can start from scratch or edit an existing TikZ figure, or even directly open your paper tex file to edit its images. The TikZ code gets instantly updated as you move around elements, without disturbing existing formatting such as line breaks and spaces.

The app makes fine-tuning the positions of elements easy and instant, without needing to recompile. It supports all common TikZ features including \foreach loops.

The app is free and open source (MIT licensed, code on GitHub). It works on the web or as a lightweight desktop app with some extra features.

**Try it:** [tikz.dev/editor](https://tikz.dev/editor)

<img src="https://tikz.dev/editor/assets/app-screenshot-2400-CwojZiE5.webp">

## Features

- **Visual canvas** with drawing tools: shapes, paths, curves, freehand, Bézier, rectangles, circles, and more
- **Live source editor** with TikZ syntax highlighting, autocompletion, and number scrubbing
- **Two-way sync**: edit visually or in code — changes reflect instantly in both views
- **Export** to SVG, PDF, or PNG
- **Import** from SVG, IPE, or PPTX
- **Multi-figure support** for documents with multiple TikZ pictures
- **Native TeX rendering** (desktop) for `\includegraphics` and user-defined preamble macros — see below

## Desktop App

Available for macOS, Windows, and Linux with additional features:

- Native file dialogs and system clipboard integration
- AI assistant for help with TikZ
- Automatic updates
- **Native TeX text engine** — see the next section

### Getting the desktop app

This fork adds features (native TeX rendering, agent screenshot capture) that
are **not yet packaged as pre-built downloads**. To run the fork's version:

- **Build and run from source** — see [Run from source (desktop app)](#run-from-source-desktop-app) below. First build takes 3–5 min; subsequent runs are seconds.
- **Or use the upstream release** (without this fork's new features) — download from [tikz.dev/editor](https://tikz.dev/editor). Pre-built installers for macOS, Windows, and Linux, with auto-update.

If you want the same one-click installation experience for this fork's version, run
`npm run build:desktop` after the initial `npm install`. Output goes to
`apps/desktop/src-tauri/target/release/bundle/` — `.dmg` on macOS, `.msi` /
`.exe` on Windows, `.AppImage` / `.deb` on Linux. Drag/install as normal.

## Native TeX rendering (desktop)

The desktop build ships a hybrid text engine: node text that MathJax can
handle (ordinary text, standard math, common macros) stays on the fast
MathJax path unchanged, while node text that structurally requires a real
TeX toolchain is compiled by a local `latex` + `dvisvgm` pipeline and the
result is embedded in the canvas as SVG. This routes on two criteria:

- The fragment contains `\includegraphics{path}` — the referenced image is
  compiled, base64-inlined into the SVG, and rendered in place. Draggable
  like any other node.
- The fragment mentions a macro defined in the document's preamble
  (`\newcommand`, `\renewcommand`, `\providecommand`, `\def`, `\gdef`,
  `\edef`, `\xdef`, `\DeclareMathOperator`). The preamble is threaded into
  every native compile, so user macros expand correctly.

### Requirements

- A TeX distribution: **MacTeX** (macOS), **TeX Live** (Linux), or **MiKTeX** (Windows).
- **Ghostscript** — for raster-image embedding under `\includegraphics`.
  Auto-detected from Homebrew, `/usr/local`, `/opt/homebrew`, `apt`, and the
  standard Windows install prefixes. Override via the `LIBGS` env var if
  needed.

Fragments that need native compilation but can't find the toolchain
silent-skip (same behavior as unknown TikZ constructs elsewhere in the
editor).

### Try it

Open **[`docs/examples/native-tex-features.tex`](docs/examples/native-tex-features.tex)** in the desktop app. Contains four figures exercising text macros, math macros, `\includegraphics`, and the three combined.

### Scope

This first release covers the *node text* level only — pgfplots and other
constructs living at the tikzpicture level are not yet routed. See
[DEVELOPMENT.md](DEVELOPMENT.md) for the architecture and the phased plan.

## Supported TikZ Features

The editor supports a wide range of TikZ constructs:

- **Shapes**: 25+ built-in shapes including rectangle, circle, ellipse, diamond, polygon, star, arrows, callouts, and more
- **Paths**: lines, curves, rectangles, circles, arcs, grids
- **Curves**: Bézier curves with control points
- **Trees**: child operations, tree layout, level/sibling styling
- **Matrices**: matrix nodes with cell alignment
- **Loops**: `\foreach` in all forms (statement, path, node)
- **Styling**: colors, line styles, fill patterns, shading, transforms

Some features have partial support (decorations, graphs, plots). Advanced constructs like `let` operations are not yet implemented.

## Getting Started

1. Open the editor at [tikz.dev/editor](https://tikz.dev/editor)
2. Start with the example or write your own TikZ code
3. Use the drawing tools in the toolbar to add and edit elements
4. Export your diagram when ready

## Run from source (desktop app)

Clone, install, and launch the desktop dev build in a few minutes. The first
Rust build takes 3–5 min (Tauri compiles ~500 crate dependencies). Subsequent
launches take seconds — Cargo caches per-crate artifacts and Vite hot-reloads
frontend changes.

### Prerequisites

- **Node.js 18+** and **npm** — the build uses Node 26 in this fork's CI but any recent LTS works.
- **Rust toolchain** (for the desktop app) — install via [rustup.rs](https://rustup.rs) if not present.
- **A TeX distribution** if you want native `\includegraphics` / user-macro rendering:
  - macOS: [MacTeX](https://tug.org/mactex/)
  - Linux: `apt install texlive-full` (or your distro's equivalent)
  - Windows: [MiKTeX](https://miktex.org/)
- **Ghostscript** — needed for raster image embedding under `\includegraphics`. Homebrew, apt, and MiKTeX all install it; the app auto-detects the shared library. Skip this if you don't need image support.

### Clone + install + run

```bash
git clone git@github.com:Riley16/tikz-editor.git
cd tikz-editor
npm install                # ~2–5 min for the monorepo
npm run dev:desktop        # first launch: 3–5 min Rust build, then window opens
```

Later runs:
```bash
npm run dev:desktop        # ~5s incremental rebuild + launch
```

Edit Rust code (`apps/desktop/src-tauri/src/`) → auto-recompiles + relaunches. Edit TypeScript/React (`packages/`, `apps/desktop/src/`) → hot-reloads instantly.

### If a second instance is running

Tauri's single-instance plugin will exit the dev launcher cleanly (no window) if an existing app with the same bundle ID is already open — including a released `.app` in `/Applications`. Quit any running TikZ Editor before `npm run dev:desktop`.

### Web build

```bash
npm run dev -w @tikz-editor/web
```

The web build has no local TeX toolchain, so `\includegraphics` and user macros are unsupported there — the app falls back to MathJax for everything.

## Agent debug features

Features intended for coding agents (Claude Code and similar) that drive the
app for testing, not for end-user workflows.

### Agent screenshot capture

A file-triggered mechanism for an external agent to obtain a pixel-level PNG
of the currently-rendered canvas. Uses the WebView's own SVG rasterizer
(same rendering pipeline that paints to the screen), so it is
**cross-platform** (macOS / Windows / Linux) and needs no OS-level Screen
Recording permission — no TCC prompt ever fires.

**Flow for the agent** (paths shown are macOS `$TMPDIR`; see
`desktop_agent_screenshot_paths` for the resolved path on any host):

```bash
# 1. Trigger a capture
touch "$TMPDIR/tikz-editor-agent-screenshot-request"

# 2. Wait a moment for the app to write the PNG.
#    The app removes the trigger file when the write is complete, so
#    absence of the trigger is a "done" signal:
while [ -f "$TMPDIR/tikz-editor-agent-screenshot-request" ]; do sleep 0.1; done

# 3. Read the result
open "$TMPDIR/tikz-editor-agent-screenshot.png"    # or feed to your agent
```

The written PNG captures the largest SVG element on the page (typically the
main canvas), at the current view's pixel dimensions × devicePixelRatio.
No app UI chrome — just the rendered figure — because the capture is
scoped to the canvas SVG rather than the whole window.

Wiring lives in [`apps/desktop/src-tauri/src/lib.rs`](apps/desktop/src-tauri/src/lib.rs) (`start_agent_screenshot_watcher`, `desktop_write_agent_screenshot`) and
[`apps/desktop/src/agent-screenshot.ts`](apps/desktop/src/agent-screenshot.ts) (`installAgentScreenshotHandler`).

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for build instructions, architecture overview, contribution guidelines, and the full script catalog (tests, capability matrix, corpus, profiling).

## License

MIT
