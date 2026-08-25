import { describe, expect, it, vi } from "vitest";

import { createHybridNodeTextEngine } from "../packages/core/src/text/hybrid-engine.js";
import type {
  NodeTextEngine,
  NodeTextMeasureRequest,
  NodeTextRenderPayload
} from "../packages/core/src/text/types.js";

function makeFakeEngine(overrides: {
  validate?: NodeTextEngine["validate"];
  measure?: NodeTextEngine["measure"];
  renderFromCache?: NodeTextEngine["renderFromCache"];
  flushPending?: NodeTextEngine["flushPending"];
} = {}): NodeTextEngine {
  return {
    validate: overrides.validate ?? vi.fn(() => null),
    measure: overrides.measure ?? vi.fn(() => null),
    renderFromCache: overrides.renderFromCache ?? vi.fn(() => null),
    flushPending: overrides.flushPending
  };
}

function baseMeasure(text: string): NodeTextMeasureRequest {
  return {
    text,
    mode: "text",
    textWidthPt: null,
    fontStyle: "normal",
    fontWeight: "normal",
    fontFamily: "serif",
    fontSizePt: 10
  };
}

/**
 * The hybrid engine's job is now very small: when a native TeX engine is
 * provided, use it for everything (native's error-render caching means
 * failures are visible, not silent-fallbacks to plain text — that's the
 * whole point). When no native engine is provided, fall back to MathJax
 * transparently — this is what the web build sees.
 */
describe("createHybridNodeTextEngine", () => {
  it("returns the raw mathjax engine when no native engine is provided", () => {
    const mathjax = makeFakeEngine();
    const hybrid = createHybridNodeTextEngine(mathjax, null);
    expect(hybrid).toBe(mathjax);
  });

  it("returns the native engine when one is provided (native-first, no routing)", () => {
    const mathjax = makeFakeEngine();
    const native = makeFakeEngine();
    const hybrid = createHybridNodeTextEngine(mathjax, native);
    expect(hybrid).toBe(native);
  });

  it("routes every fragment (plain text, math, macros, includegraphics) to native", () => {
    const mathjax = makeFakeEngine();
    const native = makeFakeEngine({
      validate: vi.fn(() => null),
      measure: vi.fn(() => null)
    });
    const hybrid = createHybridNodeTextEngine(mathjax, native);

    hybrid.measure(baseMeasure("Hello world"));
    hybrid.measure(baseMeasure("$x^2 + y^2$"));
    hybrid.measure(baseMeasure("\\myMacro{hi}"));
    hybrid.measure(baseMeasure("\\includegraphics{a.png}"));

    expect(native.measure).toHaveBeenCalledTimes(4);
    expect(mathjax.measure).not.toHaveBeenCalled();
  });

  it("validate calls also route to native", () => {
    const mathjax = makeFakeEngine();
    const native = makeFakeEngine();
    const hybrid = createHybridNodeTextEngine(mathjax, native);

    hybrid.validate("Hello");
    hybrid.validate("$x^2$");

    expect(native.validate).toHaveBeenCalledTimes(2);
    expect(mathjax.validate).not.toHaveBeenCalled();
  });

  it("renderFromCache reads directly from native", () => {
    const nativePayload: NodeTextRenderPayload = {
      cacheKey: "native-tex:abc",
      viewBox: { x: 0, y: 0, width: 10, height: 10 },
      body: "<rect/>"
    };
    const mathjax = makeFakeEngine();
    const native = makeFakeEngine({
      renderFromCache: (key) => (key === "native-tex:abc" ? nativePayload : null)
    });
    const hybrid = createHybridNodeTextEngine(mathjax, native);

    expect(hybrid.renderFromCache("native-tex:abc")).toBe(nativePayload);
    expect(hybrid.renderFromCache("nonexistent")).toBeNull();
  });

  it("flushPending is the native engine's flushPending", async () => {
    const native = makeFakeEngine({
      flushPending: vi.fn(async () => ["native-tex:x", "native-tex:y"] as readonly string[])
    });
    const mathjax = makeFakeEngine();
    const hybrid = createHybridNodeTextEngine(mathjax, native);
    const keys = (await hybrid.flushPending?.()) ?? [];
    expect(keys).toEqual(["native-tex:x", "native-tex:y"]);
    expect(native.flushPending).toHaveBeenCalledTimes(1);
  });

  it("still delegates to MathJax when native is absent (web build)", () => {
    const mathjaxValidate = vi.fn(() => null);
    const mathjaxMeasure = vi.fn(() => null);
    const mathjax = makeFakeEngine({
      validate: mathjaxValidate,
      measure: mathjaxMeasure
    });
    const hybrid = createHybridNodeTextEngine(mathjax, null);

    hybrid.validate("Hello");
    hybrid.measure(baseMeasure("$x^2$"));

    expect(mathjaxValidate).toHaveBeenCalledTimes(1);
    expect(mathjaxMeasure).toHaveBeenCalledTimes(1);
  });

  it("accepts (and ignores) userMacroNames option for API compatibility", () => {
    const mathjax = makeFakeEngine();
    const native = makeFakeEngine();
    const hybrid = createHybridNodeTextEngine(mathjax, native, {
      userMacroNames: new Set(["ignored"])
    });
    expect(hybrid).toBe(native);
  });
});
