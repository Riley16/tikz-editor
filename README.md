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

Download from [tikz.dev/editor](https://tikz.dev/editor).

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

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for build instructions, architecture overview, and contribution guidelines.

## License

MIT
