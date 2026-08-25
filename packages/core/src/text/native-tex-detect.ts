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

export function textRequiresNativeTexEngine(text: string): boolean {
  return INCLUDE_GRAPHICS_TEST_PATTERN.test(text);
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
