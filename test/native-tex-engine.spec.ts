import { describe, expect, it, vi } from "vitest";

import { createNativeTexNodeTextEngine } from "../packages/core/src/text/native-tex-engine.js";
import type {
  NativeTexCompileFn,
  NativeTexCompileResult
} from "../packages/core/src/text/native-tex-types.js";
import type { NodeTextMeasureRequest } from "../packages/core/src/text/types.js";

function stubSvg(viewBox = "0 0 80 40"): string {
  return `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><g><rect width="80" height="40" fill="red"/></g></svg>`;
}

function fakeCompile(
  responder: (source: string) => NativeTexCompileResult | Promise<NativeTexCompileResult>
): NativeTexCompileFn {
  return async (request) => {
    return await responder(request.source);
  };
}

function baseMeasureRequest(text: string): NodeTextMeasureRequest {
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

describe("createNativeTexNodeTextEngine", () => {
  it("returns null on cache miss, compiles in background, returns metrics on retry", async () => {
    const compile = vi.fn(fakeCompile(() => ({ ok: true, svg: stubSvg() })));
    const engine = createNativeTexNodeTextEngine({
      compile,
      workingDirectory: null
    });

    const first = engine.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    expect(first).toBeNull();
    expect(compile).toHaveBeenCalledTimes(1);

    const flushed = await engine.flushPending?.();
    expect(flushed?.length).toBe(1);
    const cacheKey = flushed?.[0] ?? "";
    expect(cacheKey.startsWith("native-tex:")).toBe(true);

    const second = engine.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    expect(second).not.toBeNull();
    expect(second?.cacheKey).toBe(cacheKey);
    expect(second?.width).toBeCloseTo(80, 5);
    expect(second?.height).toBeCloseTo(40, 5);
  });

  it("dedups compiles for identical fragments", async () => {
    const compile = vi.fn(fakeCompile(() => ({ ok: true, svg: stubSvg() })));
    const engine = createNativeTexNodeTextEngine({
      compile,
      workingDirectory: null
    });

    engine.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    engine.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    engine.measure(baseMeasureRequest("\\includegraphics{a.png}"));

    await engine.flushPending?.();

    expect(compile).toHaveBeenCalledTimes(1);
  });

  it("recompiles when the working directory changes (different cache namespace)", async () => {
    const compile = vi.fn(fakeCompile(() => ({ ok: true, svg: stubSvg() })));
    const engineA = createNativeTexNodeTextEngine({
      compile,
      workingDirectory: "/tmp/a"
    });
    const engineB = createNativeTexNodeTextEngine({
      compile,
      workingDirectory: "/tmp/b"
    });

    engineA.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    engineB.measure(baseMeasureRequest("\\includegraphics{a.png}"));

    await engineA.flushPending?.();
    await engineB.flushPending?.();

    expect(compile).toHaveBeenCalledTimes(2);
  });

  it("passes a complete standalone document including preamble to the compile fn", async () => {
    let receivedSource = "";
    const compile = fakeCompile((source) => {
      receivedSource = source;
      return { ok: true, svg: stubSvg() };
    });
    const engine = createNativeTexNodeTextEngine({
      compile,
      workingDirectory: "/some/dir"
    });

    engine.measure(baseMeasureRequest("\\includegraphics{plot.png}"));
    await engine.flushPending?.();

    expect(receivedSource).toContain("\\documentclass");
    expect(receivedSource).toContain("\\usepackage{graphicx}");
    expect(receivedSource).toContain("\\begin{document}");
    expect(receivedSource).toContain("\\includegraphics{plot.png}");
    expect(receivedSource).toContain("\\end{document}");
  });

  it("respects a custom preamble override", async () => {
    let receivedSource = "";
    const compile = fakeCompile((source) => {
      receivedSource = source;
      return { ok: true, svg: stubSvg() };
    });
    const engine = createNativeTexNodeTextEngine({
      compile,
      workingDirectory: null,
      preamble: "\\documentclass{article}\n\\usepackage{myextra}\n"
    });

    engine.measure(baseMeasureRequest("\\includegraphics{plot.png}"));
    await engine.flushPending?.();

    expect(receivedSource).toContain("\\usepackage{myextra}");
    expect(receivedSource).not.toContain("\\documentclass[dvisvgm,border=0pt]{standalone}");
  });

  it("appends userPreamble after the default preamble in the compile source", async () => {
    let receivedSource = "";
    const compile = fakeCompile((source) => {
      receivedSource = source;
      return { ok: true, svg: stubSvg() };
    });
    const engine = createNativeTexNodeTextEngine({
      compile,
      workingDirectory: null,
      userPreamble: "\\usepackage{pgfplots}\n\\newcommand{\\myMacro}{hello}"
    });

    engine.measure(baseMeasureRequest("\\includegraphics{plot.png}"));
    await engine.flushPending?.();

    // Both the default and the user preamble should be present, with the
    // user's content appearing AFTER the default (so they can override).
    expect(receivedSource).toContain("\\documentclass[dvisvgm,border=0pt]{standalone}");
    expect(receivedSource).toContain("\\usepackage{pgfplots}");
    expect(receivedSource).toContain("\\newcommand{\\myMacro}{hello}");
    const defaultIdx = receivedSource.indexOf("\\usepackage{graphicx}");
    const userIdx = receivedSource.indexOf("\\usepackage{pgfplots}");
    expect(userIdx).toBeGreaterThan(defaultIdx);
  });

  it("different userPreambles produce different cache keys (invalidates on change)", async () => {
    const compile = vi.fn(fakeCompile(() => ({ ok: true, svg: stubSvg() })));
    const engineA = createNativeTexNodeTextEngine({
      compile,
      workingDirectory: null,
      userPreamble: "\\usepackage{pgfplots}"
    });
    const engineB = createNativeTexNodeTextEngine({
      compile,
      workingDirectory: null,
      userPreamble: "\\usepackage{tikz-cd}"
    });

    engineA.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    engineB.measure(baseMeasureRequest("\\includegraphics{a.png}"));

    await engineA.flushPending?.();
    await engineB.flushPending?.();

    expect(compile).toHaveBeenCalledTimes(2);
  });

  it("empty userPreamble is treated as absent (no extra whitespace, no cache-key change)", async () => {
    const compile = vi.fn(fakeCompile(() => ({ ok: true, svg: stubSvg() })));
    const engineWithout = createNativeTexNodeTextEngine({
      compile,
      workingDirectory: null
    });
    const engineWithEmpty = createNativeTexNodeTextEngine({
      compile,
      workingDirectory: null,
      userPreamble: "   \n  "
    });

    engineWithout.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    await engineWithout.flushPending?.();
    const withoutKey = engineWithout.measure(baseMeasureRequest("\\includegraphics{a.png}"))!.cacheKey;

    engineWithEmpty.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    await engineWithEmpty.flushPending?.();
    const emptyKey = engineWithEmpty.measure(baseMeasureRequest("\\includegraphics{a.png}"))!.cacheKey;

    expect(emptyKey).toBe(withoutKey);
  });

  it("surfaces compile failures once per kind via onCompileFailure", async () => {
    const compile = fakeCompile(() => ({
      ok: false,
      kind: "compile-failed",
      message: "! LaTeX Error: File `missing.png' not found."
    }));
    const onCompileFailure = vi.fn();
    const engine = createNativeTexNodeTextEngine({
      compile,
      workingDirectory: null,
      onCompileFailure
    });

    engine.measure(baseMeasureRequest("\\includegraphics{one.png}"));
    engine.measure(baseMeasureRequest("\\includegraphics{two.png}"));
    await engine.flushPending?.();

    expect(onCompileFailure).toHaveBeenCalledTimes(1);
    expect(onCompileFailure.mock.calls[0][0].kind).toBe("compile-failed");
  });

  it("surfaces different failure kinds separately", async () => {
    const kindsSeen: string[] = [];
    let call = 0;
    const compile = fakeCompile(() => {
      call += 1;
      if (call === 1) {
        return {
          ok: false,
          kind: "toolchain-missing",
          message: "pdflatex not found"
        };
      }
      return { ok: false, kind: "compile-failed", message: "broken" };
    });
    const engine = createNativeTexNodeTextEngine({
      compile,
      workingDirectory: null,
      onCompileFailure: (r) => kindsSeen.push(r.kind)
    });

    engine.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    await engine.flushPending?.();
    engine.measure(baseMeasureRequest("\\includegraphics{b.png}"));
    await engine.flushPending?.();

    expect(kindsSeen).toEqual(["toolchain-missing", "compile-failed"]);
  });

  it("caches failed compiles as visible error renders (no retry on same cache key)", async () => {
    // Deliberate behavior change: prior versions retried failed compiles on
    // every measure(); now failures are cached with a red-bordered error SVG
    // so the user sees a clear "compile failed" indicator in the canvas
    // instead of a silent fall-back to raw source text. Recovery: any edit
    // to the fragment or preamble changes the cache key, triggering a fresh
    // compile automatically.
    const compile = vi.fn(
      fakeCompile(() => ({
        ok: false,
        kind: "compile-failed",
        message: "! LaTeX Error: ..."
      }))
    );
    const engine = createNativeTexNodeTextEngine({
      compile,
      workingDirectory: null
    });

    engine.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    await engine.flushPending?.();

    engine.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    await engine.flushPending?.();

    // Second measure hits the cached error render, no re-compile.
    expect(compile).toHaveBeenCalledTimes(1);

    // The cached "render" is the error indicator, not null, so semantic
    // will use it (mode: "mathjax") and svg emit will draw the red box.
    const metrics = engine.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    expect(metrics).not.toBeNull();
    const payload = engine.renderFromCache(metrics!.cacheKey);
    expect(payload).not.toBeNull();
    expect(payload!.body).toContain("stroke=\"#d33\"");
    expect(payload!.body).toContain("compile-failed");
  });

  it("caches runtime-error failures the same way (visible error render)", async () => {
    const compile = fakeCompile(() => ({
      ok: false,
      kind: "runtime-error",
      message: "transient"
    }));
    const engine = createNativeTexNodeTextEngine({
      compile,
      workingDirectory: null
    });

    engine.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    await engine.flushPending?.();

    const metrics = engine.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    expect(metrics).not.toBeNull();
    const payload = engine.renderFromCache(metrics!.cacheKey);
    expect(payload!.body).toContain("runtime-error");
  });

  it("returns null from renderFromCache for keys that don't own the prefix", () => {
    const engine = createNativeTexNodeTextEngine({
      compile: fakeCompile(() => ({ ok: true, svg: stubSvg() })),
      workingDirectory: null
    });
    expect(engine.renderFromCache('{"mode":"text"}')).toBeNull();
  });

  it("returns the cached payload after a successful compile", async () => {
    const engine = createNativeTexNodeTextEngine({
      compile: fakeCompile(() => ({ ok: true, svg: stubSvg("0 0 100 50") })),
      workingDirectory: null
    });

    engine.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    const flushed = await engine.flushPending?.();
    const cacheKey = flushed?.[0] ?? "";

    const payload = engine.renderFromCache(cacheKey);
    expect(payload).not.toBeNull();
    expect(payload?.viewBox).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(payload?.body).toContain("<rect");
    expect(payload?.body).not.toContain("<svg");
  });

  it("falls back to width/height=Npt attributes when no viewBox is present", async () => {
    const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="72pt" height="36pt"><rect/></svg>`;
    const engine = createNativeTexNodeTextEngine({
      compile: fakeCompile(() => ({ ok: true, svg })),
      workingDirectory: null
    });

    engine.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    await engine.flushPending?.();

    const metrics = engine.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    expect(metrics?.width).toBeCloseTo(72, 5);
    expect(metrics?.height).toBeCloseTo(36, 5);
  });

  it("surfaces runtime-error when the compile succeeds but returns un-parseable SVG", async () => {
    const seen: unknown[] = [];
    const engine = createNativeTexNodeTextEngine({
      compile: fakeCompile(() => ({ ok: true, svg: "<not-svg/>" })),
      workingDirectory: null,
      onCompileFailure: (r) => seen.push(r)
    });

    engine.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    await engine.flushPending?.();

    expect(seen).toHaveLength(1);
    expect((seen[0] as { kind: string }).kind).toBe("runtime-error");
  });

  it("mtime probe changes the cache key (invalidates when asset changes on disk)", async () => {
    const compile = vi.fn(fakeCompile(() => ({ ok: true, svg: stubSvg() })));
    let mtime = 100;
    const engine = createNativeTexNodeTextEngine({
      compile,
      workingDirectory: "/tmp/proj",
      mtimeReader: async () => mtime
    });

    engine.measure(baseMeasureRequest("\\includegraphics{plot.png}"));
    await engine.flushPending?.();

    mtime = 200;
    engine.measure(baseMeasureRequest("\\includegraphics{plot.png}"));
    await engine.flushPending?.();

    expect(compile).toHaveBeenCalledTimes(2);
  });

  it("scales returned metrics by fontSize/10 (matches MathJax convention)", async () => {
    const engine = createNativeTexNodeTextEngine({
      compile: fakeCompile(() => ({ ok: true, svg: stubSvg("0 0 100 50") })),
      workingDirectory: null
    });

    engine.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    await engine.flushPending?.();

    const at10 = engine.measure(baseMeasureRequest("\\includegraphics{a.png}"));
    const at20 = engine.measure({
      ...baseMeasureRequest("\\includegraphics{a.png}"),
      fontSizePt: 20
    });

    expect(at10?.width).toBeCloseTo(100, 5);
    expect(at20?.width).toBeCloseTo(200, 5);
  });
});
