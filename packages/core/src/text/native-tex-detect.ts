/**
 * Route a node's text through the native-TeX engine (rather than MathJax) iff
 * it contains a construct MathJax structurally cannot render. Phase 1: just
 * `\includegraphics`. Future phases can add more macros here without touching
 * the wrapper engine's routing logic.
 *
 * False negatives (missing a construct that MathJax can't handle) are the
 * status quo — they leave the render silent-skipping as it does today, no
 * regression. False positives (routing a MathJax-capable fragment) waste
 * compile budget but produce correct output, so err toward specific patterns
 * rather than broad ones.
 */
const INCLUDE_GRAPHICS_TEST_PATTERN =
  /\\includegraphics\b\s*(?:\[[^\]]*\])?\s*\{[^}]+\}/;

const INCLUDE_GRAPHICS_CAPTURE_PATTERN =
  /\\includegraphics\b\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g;

/**
 * All `\`-prefixed tokens in the fragment. Used to decide whether any
 * user-defined preamble macro appears in the text (which means MathJax will
 * silent-fail — it doesn't know about the user's macros — so we should route
 * the fragment through the native TeX engine where the threaded preamble
 * makes the macro definitions available).
 */
const CONTROL_SEQUENCE_PATTERN = /\\([a-zA-Z@]+)/g;

export function textRequiresNativeTexEngine(
  text: string,
  userMacroNames?: ReadonlySet<string>
): boolean {
  if (INCLUDE_GRAPHICS_TEST_PATTERN.test(text)) {
    return true;
  }
  if (userMacroNames && userMacroNames.size > 0) {
    CONTROL_SEQUENCE_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CONTROL_SEQUENCE_PATTERN.exec(text)) !== null) {
      const name = match[1];
      if (name && userMacroNames.has(name)) {
        return true;
      }
    }
  }
  return false;
}

export function collectIncludeGraphicsPaths(text: string): string[] {
  const paths: string[] = [];
  INCLUDE_GRAPHICS_CAPTURE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INCLUDE_GRAPHICS_CAPTURE_PATTERN.exec(text)) !== null) {
    const raw = match[1]?.trim();
    if (raw && raw.length > 0) {
      paths.push(raw);
    }
  }
  return paths;
}
