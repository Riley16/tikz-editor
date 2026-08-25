# Desktop Shell (Tauri v2)

This package hosts the desktop shell for TikZ Editor using Tauri v2.

## Scripts

- `npm run -w @tikz-editor/desktop dev` runs the Vite frontend on port 1420.
- `npm run -w @tikz-editor/desktop tauri:dev` runs the full Tauri desktop app.
- `npm run -w @tikz-editor/desktop tauri:build` creates desktop bundles.
- `npm run -w @tikz-editor/desktop test:e2e` runs real desktop e2e against a built binary (requires `tauri-driver` in PATH).

## Desktop-only features

Features exclusive to this shell, not available in the web build:

- **Native TeX text engine** — every node text is compiled by a local
  `latex` + `dvisvgm` pipeline (see `desktop_compile_tex_fragment` in
  `src-tauri/src/lib.rs`). Supports `\includegraphics` and user-defined
  preamble macros (`\newcommand`, `\def`, `\DeclareMathOperator`, etc.).
  Requires a TeX distribution + Ghostscript on the host.
- **Agent screenshot capture** (debug) — file-triggered pixel-level canvas
  capture for coding agents driving the app. `touch $TMPDIR/tikz-editor-agent-screenshot-request`
  produces `$TMPDIR/tikz-editor-agent-screenshot.png` via the WebView's
  own SVG rasterizer — no OS Screen Recording permission needed. See
  `src/agent-screenshot.ts` and `start_agent_screenshot_watcher` in
  `src-tauri/src/lib.rs`.

Full details, requirements, and a tutorial example are in the [root README](../../README.md#native-tex-rendering-desktop) and [`docs/examples/native-tex-features.tex`](../../docs/examples/native-tex-features.tex).
