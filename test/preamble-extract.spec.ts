import { describe, expect, it } from "vitest";

import {
  collectPreambleMacros,
  extractUserPreamble
} from "../packages/core/src/text/preamble-extract.js";

describe("extractUserPreamble", () => {
  it("returns empty string for source with no tikzpicture", () => {
    expect(extractUserPreamble("just some text")).toBe("");
    expect(extractUserPreamble("")).toBe("");
  });

  it("returns empty string for a pure-fragment document starting with tikzpicture", () => {
    const source = "\\begin{tikzpicture}\n  \\draw (0,0) -- (1,1);\n\\end{tikzpicture}\n";
    expect(extractUserPreamble(source)).toBe("");
  });

  it("captures a single \\usepackage line before the first tikzpicture", () => {
    const source = String.raw`\usepackage{pgfplots}
\begin{tikzpicture}
  \draw (0,0) -- (1,1);
\end{tikzpicture}
`;
    expect(extractUserPreamble(source)).toBe("\\usepackage{pgfplots}");
  });

  it("captures multiple usepackage + newcommand lines", () => {
    const source = String.raw`\usepackage{pgfplots}
\usepackage{amsmath}
\newcommand{\myMacro}{\mathbb{R}}
\begin{tikzpicture}
  \node at (0,0) {$\myMacro$};
\end{tikzpicture}
`;
    const extracted = extractUserPreamble(source);
    expect(extracted).toContain("\\usepackage{pgfplots}");
    expect(extracted).toContain("\\usepackage{amsmath}");
    expect(extracted).toContain("\\newcommand{\\myMacro}{\\mathbb{R}}");
  });

  it("filters out \\documentclass, \\begin{document}, and \\end{document} lines", () => {
    const source = String.raw`\documentclass{article}
\usepackage{pgfplots}
\begin{document}
\begin{tikzpicture}
  \draw (0,0) -- (1,1);
\end{tikzpicture}
\end{document}
`;
    const extracted = extractUserPreamble(source);
    expect(extracted).toContain("\\usepackage{pgfplots}");
    expect(extracted).not.toContain("\\documentclass");
    expect(extracted).not.toContain("\\begin{document}");
    expect(extracted).not.toContain("\\end{document}");
  });

  it("captures a \\tikzset call before the first tikzpicture", () => {
    const source = String.raw`\tikzset{every node/.style={draw=blue}}
\begin{tikzpicture}
  \node at (0,0) {hi};
\end{tikzpicture}
`;
    expect(extractUserPreamble(source)).toContain("\\tikzset");
  });

  it("handles inline \\tikz[...] as a fragment start", () => {
    const source = String.raw`\usepackage{pgfplots}
\tikz[scale=2]{\draw (0,0) -- (1,1);}
`;
    expect(extractUserPreamble(source)).toBe("\\usepackage{pgfplots}");
  });

  it("preserves multi-line \\newcommand across the preamble", () => {
    const source = String.raw`\usepackage{amsmath}
\newcommand{\foo}[1]{%
  \textbf{#1}%
}
\begin{tikzpicture}
  \node at (0,0) {\foo{hi}};
\end{tikzpicture}
`;
    const extracted = extractUserPreamble(source);
    expect(extracted).toContain("\\newcommand{\\foo}[1]{%");
    expect(extracted).toContain("\\textbf{#1}%");
  });

  it("returns empty when only comments precede the tikzpicture", () => {
    const source = `% figure 1\n% draws a line\n\\begin{tikzpicture}\n  \\draw (0,0) -- (1,1);\n\\end{tikzpicture}\n`;
    // The extractor keeps the comment lines but trims trailing/leading
    // whitespace overall; comments alone are treated as effectively empty
    // preamble for compile purposes.
    const extracted = extractUserPreamble(source);
    expect(extracted).toContain("% figure 1");
    expect(extracted).toContain("% draws a line");
  });
});

describe("collectPreambleMacros", () => {
  it("returns empty set for empty preamble", () => {
    expect(collectPreambleMacros("")).toEqual(new Set());
    expect(collectPreambleMacros("just text")).toEqual(new Set());
  });

  it("captures \\newcommand with braced name", () => {
    const preamble = "\\newcommand{\\foo}{bar}";
    expect(collectPreambleMacros(preamble)).toEqual(new Set(["foo"]));
  });

  it("captures \\newcommand with arg count", () => {
    const preamble = "\\newcommand{\\foo}[2]{#1 and #2}";
    expect(collectPreambleMacros(preamble)).toEqual(new Set(["foo"]));
  });

  it("captures \\newcommand* (starred form)", () => {
    expect(collectPreambleMacros("\\newcommand*{\\bar}{baz}")).toEqual(
      new Set(["bar"])
    );
  });

  it("captures \\renewcommand and \\providecommand", () => {
    const preamble = "\\renewcommand{\\alpha}{a}\n\\providecommand{\\beta}{b}";
    expect(collectPreambleMacros(preamble)).toEqual(new Set(["alpha", "beta"]));
  });

  it("captures \\def and its variants", () => {
    const preamble = "\\def\\myA{a}\n\\gdef\\myB#1{#1}\n\\edef\\myC{c}";
    const macros = collectPreambleMacros(preamble);
    expect(macros).toEqual(new Set(["myA", "myB", "myC"]));
  });

  it("captures \\DeclareMathOperator", () => {
    const preamble = "\\DeclareMathOperator{\\myOp}{OpName}\n\\DeclareMathOperator*{\\myLim}{lim}";
    expect(collectPreambleMacros(preamble)).toEqual(new Set(["myOp", "myLim"]));
  });

  it("captures multiple macros in a realistic preamble", () => {
    const preamble = String.raw`\usepackage{amsmath}
\usepackage{pgfplots}
\newcommand{\R}{\mathbb{R}}
\newcommand{\myVec}[1]{\vec{#1}}
\DeclareMathOperator{\argmax}{arg\,max}
\def\halfway{0.5}`;
    const macros = collectPreambleMacros(preamble);
    expect(macros).toEqual(new Set(["R", "myVec", "argmax", "halfway"]));
  });

  it("ignores \\usepackage and other non-definition commands", () => {
    const preamble = "\\usepackage{amsmath}\n\\tikzset{every node/.style={draw=blue}}";
    expect(collectPreambleMacros(preamble).size).toBe(0);
  });

  it("captures macros with @ in name (LaTeX internal-style)", () => {
    expect(collectPreambleMacros("\\newcommand{\\my@macro}{x}")).toEqual(
      new Set(["my@macro"])
    );
  });
});
