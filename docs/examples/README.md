# examples

Standalone `.tex` files that demonstrate features of the editor.

Open one from the desktop app via **File → Open** (or drag onto the app window).

## Files

- **[`native-tex-features.tex`](native-tex-features.tex)** — the native TeX
  text engine: `\includegraphics` inside nodes, plus user-defined preamble
  macros (`\newcommand`, `\def`, `\DeclareMathOperator`) that MathJax cannot
  expand.
  - Requires: a TeX distribution (MacTeX / TeX Live / MiKTeX) and Ghostscript
    (for image embedding). Desktop app only — the web build has no local TeX
    toolchain.
  - Supporting assets: [`plot_sin.png`](plot_sin.png), [`plot_contour.png`](plot_contour.png).
