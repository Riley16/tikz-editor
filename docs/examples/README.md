# examples

Standalone `.tex` files that demonstrate features of the editor.

Open one from the desktop app via **File → Open** (or drag onto the app window).

## Files

- **[`native-tex-features.tex`](native-tex-features.tex)** — the native TeX
  text engine: `\includegraphics` inside nodes, plus user-defined preamble
  macros (`\newcommand`, `\def`, `\DeclareMathOperator`) that a JS-based math
  renderer cannot expand.
  - Requires: a TeX distribution (MacTeX / TeX Live / MiKTeX) and Ghostscript
    (for image embedding). Desktop app only — the web build has no local TeX
    toolchain.
  - Supporting assets: [`plot_sin.png`](plot_sin.png), [`plot_contour.png`](plot_contour.png).

## See also

- Root [README → Native TeX rendering](../../README.md#native-tex-rendering-desktop) — feature overview + requirements + scope.
- Root [README → Run from source](../../README.md#run-from-source-desktop-app) — how to build the desktop app that consumes these examples.
- [`DEVELOPMENT.md`](../../DEVELOPMENT.md) — architecture of the text engine pipeline (parser → semantic → text engine → SVG emit).
