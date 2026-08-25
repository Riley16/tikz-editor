import { describe, expect, it, vi } from "vitest";

import { createHybridNodeTextEngine } from "../packages/core/src/text/hybrid-engine.js";
import type {
  NodeTextEngine,
  NodeTextMeasureRequest,
  NodeTextMetrics,
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

describe("createHybridNodeTextEngine", () => {
  it("returns the raw mathjax engine when no native engine is provided", () => {
    const mathjax = makeFakeEngine();
    const hybrid = createHybridNodeTextEngine(mathjax, null);
    expect(hybrid).toBe(mathjax);
  });

  it("routes plain text through MathJax", () => {
    const mathjax = makeFakeEngine({
      validate: vi.fn(() => null),
      measure: vi.fn(() => null)
    });
    const native = makeFakeEngine({
      validate: vi.fn(() => null),
      measure: vi.fn(() => null)
    });
    const hybrid = createHybridNodeTextEngine(mathjax, native);

    hybrid.validate("Hello world");
    hybrid.measure(baseMeasure("Hello world"));

    expect(mathjax.validate).toHaveBeenCalledTimes(1);
    expect(mathjax.measure).toHaveBeenCalledTimes(1);
    expect(native.validate).not.toHaveBeenCalled();
    expect(native.measure).not.toHaveBeenCalled();
  });

  it("routes MathJax-safe math through MathJax (not native)", () => {
    const mathjax = makeFakeEngine();
    const native = makeFakeEngine();
    const hybrid = createHybridNodeTextEngine(mathjax, native);

    hybrid.measure(baseMeasure("$x^2 + y^2 = r^2$"));

    expect(mathjax.measure).toHaveBeenCalledTimes(1);
    expect(native.measure).not.toHaveBeenCalled();
  });

  it("routes \\includegraphics fragments through the native engine", () => {
    const mathjax = makeFakeEngine();
    const native = makeFakeEngine();
    const hybrid = createHybridNodeTextEngine(mathjax, native);

    hybrid.validate("\\includegraphics{plot.png}");
    hybrid.measure(baseMeasure("\\includegraphics[width=3cm]{plot.png}"));

    expect(native.validate).toHaveBeenCalledTimes(1);
    expect(native.measure).toHaveBeenCalledTimes(1);
    expect(mathjax.validate).not.toHaveBeenCalled();
    expect(mathjax.measure).not.toHaveBeenCalled();
  });

  it("renderFromCache prefers a native cache hit but falls back to mathjax", () => {
    const nativePayload: NodeTextRenderPayload = {
      cacheKey: "native-tex:abc",
      viewBox: { x: 0, y: 0, width: 10, height: 10 },
      body: "<rect/>"
    };
    const mathjaxPayload: NodeTextRenderPayload = {
      cacheKey: "some-mj-key",
      viewBox: { x: 0, y: 0, width: 20, height: 20 },
      body: "<text/>"
    };
    const mathjax = makeFakeEngine({
      renderFromCache: (key) => (key === "some-mj-key" ? mathjaxPayload : null)
    });
    const native = makeFakeEngine({
      renderFromCache: (key) => (key === "native-tex:abc" ? nativePayload : null)
    });
    const hybrid = createHybridNodeTextEngine(mathjax, native);

    expect(hybrid.renderFromCache("native-tex:abc")).toBe(nativePayload);
    expect(hybrid.renderFromCache("some-mj-key")).toBe(mathjaxPayload);
    expect(hybrid.renderFromCache("nonexistent")).toBeNull();
  });

  it("flushPending awaits both engines and concatenates their finalized keys", async () => {
    const mathjax = makeFakeEngine({
      flushPending: vi.fn(async () => ["mj-1", "mj-2"] as readonly string[])
    });
    const native = makeFakeEngine({
      flushPending: vi.fn(async () => ["native-tex:x"] as readonly string[])
    });
    const hybrid = createHybridNodeTextEngine(mathjax, native);

    const keys = (await hybrid.flushPending?.()) ?? [];
    expect(keys).toEqual(["mj-1", "mj-2", "native-tex:x"]);
    expect(mathjax.flushPending).toHaveBeenCalledTimes(1);
    expect(native.flushPending).toHaveBeenCalledTimes(1);
  });

  it("flushPending handles engines without their own flushPending", async () => {
    const mathjax = makeFakeEngine({ flushPending: undefined });
    const native = makeFakeEngine({ flushPending: undefined });
    const hybrid = createHybridNodeTextEngine(mathjax, native);
    const keys = (await hybrid.flushPending?.()) ?? [];
    expect(keys).toEqual([]);
  });

  it("preserves the metrics object identity returned by the underlying engine", () => {
    const metrics: NodeTextMetrics = {
      cacheKey: "native-tex:xyz",
      width: 100,
      height: 50,
      baselineY: -25,
      midLineY: 0,
      paragraphId: null,
      renderSourceText: "\\includegraphics{a.png}"
    };
    const native = makeFakeEngine({ measure: () => metrics });
    const mathjax = makeFakeEngine();
    const hybrid = createHybridNodeTextEngine(mathjax, native);
    expect(hybrid.measure(baseMeasure("\\includegraphics{a.png}"))).toBe(metrics);
  });

  it("with userMacroNames, routes text using a user macro to native", () => {
    const mathjax = makeFakeEngine();
    const native = makeFakeEngine();
    const hybrid = createHybridNodeTextEngine(mathjax, native, {
      userMacroNames: new Set(["myMacro"])
    });

    hybrid.measure(baseMeasure("\\myMacro{hello}"));

    expect(native.measure).toHaveBeenCalledTimes(1);
    expect(mathjax.measure).not.toHaveBeenCalled();
  });

  it("with userMacroNames, still routes plain text to MathJax", () => {
    const mathjax = makeFakeEngine();
    const native = makeFakeEngine();
    const hybrid = createHybridNodeTextEngine(mathjax, native, {
      userMacroNames: new Set(["myMacro"])
    });

    hybrid.measure(baseMeasure("Hello world"));
    hybrid.measure(baseMeasure("$x^2$"));

    expect(mathjax.measure).toHaveBeenCalledTimes(2);
    expect(native.measure).not.toHaveBeenCalled();
  });

  it("without userMacroNames, only \\includegraphics routes to native", () => {
    const mathjax = makeFakeEngine();
    const native = makeFakeEngine();
    const hybrid = createHybridNodeTextEngine(mathjax, native);

    hybrid.measure(baseMeasure("\\customMacro{x}"));

    expect(mathjax.measure).toHaveBeenCalledTimes(1);
    expect(native.measure).not.toHaveBeenCalled();
  });
});
