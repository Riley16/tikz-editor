import type {
  NodeTextEngine,
  NodeTextMeasureRequest,
  NodeTextMetrics,
  NodeTextRenderPayload,
  NodeTextValidationIssue
} from "./types.js";
import { textRequiresNativeTexEngine } from "./native-tex-detect.js";

/**
 * Wrap the existing MathJax engine with an optional native-TeX engine so
 * that a node's text is routed to whichever engine can render it correctly.
 *
 * Design notes:
 * - Routing is per-call and cheap (a single regex probe). MathJax remains the
 *   fast default; native is only reached when the fragment structurally
 *   requires it (currently: `\includegraphics{...}`).
 * - `renderFromCache` is unaware of which engine populated a cache entry, so
 *   it tries both; cache keys are prefixed by the native engine to make the
 *   dispatch cost O(1) in the miss case.
 * - When no native engine is provided, this wrapper behaves as a pass-through
 *   on MathJax — the existing test suite exercises exactly this shape.
 */
export function createHybridNodeTextEngine(
  mathjax: NodeTextEngine,
  native: NodeTextEngine | null
): NodeTextEngine {
  if (native == null) {
    return mathjax;
  }

  return {
    validate(text: string): NodeTextValidationIssue | null {
      return textRequiresNativeTexEngine(text)
        ? native.validate(text)
        : mathjax.validate(text);
    },

    measure(request: NodeTextMeasureRequest): NodeTextMetrics | null {
      return textRequiresNativeTexEngine(request.text)
        ? native.measure(request)
        : mathjax.measure(request);
    },

    renderFromCache(cacheKey: string): NodeTextRenderPayload | null {
      const nativeHit = native.renderFromCache(cacheKey);
      if (nativeHit != null) {
        return nativeHit;
      }
      return mathjax.renderFromCache(cacheKey);
    },

    async flushPending(): Promise<readonly string[]> {
      const mathjaxKeys = mathjax.flushPending ? await mathjax.flushPending() : [];
      const nativeKeys = native.flushPending ? await native.flushPending() : [];
      if (mathjaxKeys.length === 0) {
        return nativeKeys;
      }
      if (nativeKeys.length === 0) {
        return mathjaxKeys;
      }
      return [...mathjaxKeys, ...nativeKeys];
    }
  };
}
