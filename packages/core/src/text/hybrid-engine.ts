import type { NodeTextEngine } from "./types.js";

export type HybridNodeTextEngineOptions = {
  /**
   * Set of user-defined macro names extracted from the document preamble.
   * Retained on the type for backward-compatibility with earlier per-fragment
   * routing; the current implementation always uses the native engine when
   * one is available, so this field is effectively ignored. Kept optional so
   * existing callers don't break.
   */
  userMacroNames?: ReadonlySet<string>;
};

/**
 * Wrap the existing MathJax engine with an optional native-TeX engine so
 * that a node's text is routed to whichever engine can render it correctly.
 *
 * Design notes:
 * - Routing is per-call and cheap (a single regex probe). MathJax remains the
 *   fast default; native is only reached when the fragment structurally
 *   requires it (`\includegraphics`) or mentions a user-defined preamble macro
 *   MathJax couldn't have learned about.
 * - `renderFromCache` is unaware of which engine populated a cache entry, so
 *   it tries both; cache keys are prefixed by the native engine to make the
 *   dispatch cost O(1) in the miss case.
 * - When no native engine is provided, this wrapper behaves as a pass-through
 *   on MathJax — the existing test suite exercises exactly this shape.
 */
export function createHybridNodeTextEngine(
  mathjax: NodeTextEngine,
  native: NodeTextEngine | null,
  _options?: HybridNodeTextEngineOptions
): NodeTextEngine {
  if (native == null) {
    return mathjax;
  }
  // When a native TeX engine is available, use it for ALL node text — MathJax
  // is bypassed on this path. Rationale: MathJax silent-fails on any macro or
  // construct outside its (limited) supported subset, which then falls back
  // to raw-source plain-text rendering in the canvas — an invisible failure
  // that's very confusing. The native engine's failure mode is explicit:
  // compile failures produce a visible error render (see buildErrorRender in
  // native-tex-engine.ts) so the user always sees either a correct render or
  // a clear "compile failed" indicator.
  //
  // MathJax is retained in the codebase for the web build (which has no local
  // TeX toolchain, so native is always null there — the `if` above returns
  // mathjax) and as a defense-in-depth fallback if a caller wires the hybrid
  // engine without a native side.
  return native;
}
