import { describe, expect, it } from "vitest";

import {
  collectIncludeGraphicsPaths,
  textRequiresNativeTexEngine
} from "../packages/core/src/text/native-tex-detect.js";

describe("textRequiresNativeTexEngine", () => {
  it("matches a bare \\includegraphics with just a path", () => {
    expect(textRequiresNativeTexEngine("\\includegraphics{plot.png}")).toBe(true);
  });

  it("matches \\includegraphics with options", () => {
    expect(
      textRequiresNativeTexEngine("\\includegraphics[width=3cm]{plots/sin.pdf}")
    ).toBe(true);
  });

  it("matches when embedded in surrounding node text", () => {
    expect(
      textRequiresNativeTexEngine("prefix \\includegraphics[width=1cm]{a.png} suffix")
    ).toBe(true);
  });

  it("does not match near-misses that share a prefix", () => {
    expect(textRequiresNativeTexEngine("\\includegraphicsdemo{a.png}")).toBe(false);
    expect(textRequiresNativeTexEngine("\\includeGraphics{a.png}")).toBe(false);
  });

  it("does not match plain text or MathJax-safe content", () => {
    expect(textRequiresNativeTexEngine("Hello world")).toBe(false);
    expect(textRequiresNativeTexEngine("$x^2 + y^2$")).toBe(false);
    expect(textRequiresNativeTexEngine("\\textbf{bold}")).toBe(false);
    expect(textRequiresNativeTexEngine("")).toBe(false);
  });

  it("does not match \\includegraphics without a filename argument", () => {
    expect(textRequiresNativeTexEngine("\\includegraphics")).toBe(false);
    expect(textRequiresNativeTexEngine("\\includegraphics[width=1cm]")).toBe(false);
    expect(textRequiresNativeTexEngine("\\includegraphics{}")).toBe(false);
  });
});

describe("collectIncludeGraphicsPaths", () => {
  it("returns an empty list when no matches are present", () => {
    expect(collectIncludeGraphicsPaths("Hello world")).toEqual([]);
  });

  it("captures a single path", () => {
    expect(collectIncludeGraphicsPaths("\\includegraphics{plot.png}")).toEqual([
      "plot.png"
    ]);
  });

  it("captures multiple paths in source order", () => {
    const source =
      "\\includegraphics[width=1cm]{a.png} and \\includegraphics{b.pdf}";
    expect(collectIncludeGraphicsPaths(source)).toEqual(["a.png", "b.pdf"]);
  });

  it("trims surrounding whitespace inside the braces", () => {
    expect(
      collectIncludeGraphicsPaths("\\includegraphics{  spaced.png  }")
    ).toEqual(["spaced.png"]);
  });

  it("skips empty-brace calls", () => {
    expect(collectIncludeGraphicsPaths("\\includegraphics{}")).toEqual([]);
  });

  it("is safe to call repeatedly (regex lastIndex is reset)", () => {
    const source = "\\includegraphics{a.png}";
    expect(collectIncludeGraphicsPaths(source)).toEqual(["a.png"]);
    expect(collectIncludeGraphicsPaths(source)).toEqual(["a.png"]);
  });
});
