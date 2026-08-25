/**
 * Extract the user-authored LaTeX preamble from a `.tex` document so it can be
 * threaded into the native TeX engine's per-fragment compile. Without this,
 * fragments that reference user-defined macros / extra packages (`\usepackage
 * {pgfplots}`, `\newcommand{\myMacro}{...}`, `\tikzset{...}`) would fail to
 * compile in isolation.
 *
 * Heuristic:
 * - Preamble is everything before the first `\begin{tikzpicture}` (or inline
 *   `\tikz[...]{...}`). Files that are pure TikZ fragments with no preceding
 *   preamble return an empty string.
 * - `\documentclass`, `\begin{document}`, and `\end{document}` are filtered
 *   out — the native engine wraps every fragment in its own `standalone`
 *   document; we don't want the user's document class + begin/end interfering.
 * - Comments and blank lines are preserved (harmless, keeps line numbers
 *   roughly aligned in compile logs).
 *
 * Non-goals:
 * - Not a LaTeX parser. Comments containing `\begin{tikzpicture}` on a `%`
 *   line would confuse this heuristic; acceptable tradeoff for a pass built
 *   for the common case.
 */
const TIKZ_PICTURE_START_PATTERN = /\\begin\{tikzpicture\}|\\tikz\s*[\[{]/;
const DOCUMENTCLASS_LINE_PATTERN = /^\s*\\documentclass\b/;
const BEGIN_DOCUMENT_LINE_PATTERN = /^\s*\\begin\{document\}/;
const END_DOCUMENT_LINE_PATTERN = /^\s*\\end\{document\}/;

export function extractUserPreamble(source: string): string {
  const startMatch = TIKZ_PICTURE_START_PATTERN.exec(source);
  if (!startMatch) {
    return "";
  }
  const before = source.slice(0, startMatch.index);
  if (before.trim().length === 0) {
    return "";
  }
  const kept: string[] = [];
  for (const line of before.split(/\r?\n/)) {
    if (DOCUMENTCLASS_LINE_PATTERN.test(line)) continue;
    if (BEGIN_DOCUMENT_LINE_PATTERN.test(line)) continue;
    if (END_DOCUMENT_LINE_PATTERN.test(line)) continue;
    kept.push(line);
  }
  const joined = kept.join("\n").trim();
  return joined.length > 0 ? joined : "";
}

const NEWCOMMAND_MACRO_PATTERN =
  /\\(?:new|renew|provide)command\*?\s*\{?\\([a-zA-Z@]+)\}?/g;
const DEF_MACRO_PATTERN = /\\(?:g?def|edef|xdef)\s*\\([a-zA-Z@]+)/g;
const DECLARE_MATH_OPERATOR_PATTERN =
  /\\DeclareMathOperator\*?\s*\{?\\([a-zA-Z@]+)\}?/g;

/**
 * Collect the names (without leading backslash) of macros defined in the
 * preamble via `\newcommand`, `\renewcommand`, `\providecommand`, `\def`,
 * `\edef`, `\xdef`, or `\DeclareMathOperator`. Used by the routing heuristic
 * to send any node text mentioning a user macro through the native TeX
 * engine — MathJax can't expand macros it wasn't taught about, so without
 * this those fragments would silent-fail.
 */
export function collectPreambleMacros(preamble: string): Set<string> {
  const macros = new Set<string>();
  const patterns = [
    NEWCOMMAND_MACRO_PATTERN,
    DEF_MACRO_PATTERN,
    DECLARE_MATH_OPERATOR_PATTERN
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(preamble)) !== null) {
      const name = match[1];
      if (name && name.length > 0) {
        macros.add(name);
      }
    }
  }
  return macros;
}
