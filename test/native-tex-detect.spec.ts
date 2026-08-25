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

describe("textRequiresNativeTexEngine with user-defined macros", () => {
  it("routes text mentioning a user macro to native", () => {
    const userMacros = new Set(["myBold"]);
    expect(textRequiresNativeTexEngine("\\myBold{hello}", userMacros)).toBe(true);
  });

  it("does not route text with no user macro appearances", () => {
    const userMacros = new Set(["myBold"]);
    expect(textRequiresNativeTexEngine("plain text", userMacros)).toBe(false);
    expect(textRequiresNativeTexEngine("\\textbf{hi}", userMacros)).toBe(false);
  });

  it("does not partial-match longer macro names", () => {
    // If userMacros = {"my"}, the token "\\myThing" should NOT route since
    // "my" is not the full control sequence.
    const userMacros = new Set(["my"]);
    expect(textRequiresNativeTexEngine("\\myThing{x}", userMacros)).toBe(false);
  });

  it("still routes \\includegraphics regardless of macro set", () => {
    expect(
      textRequiresNativeTexEngine("\\includegraphics{a.png}", new Set())
    ).toBe(true);
    expect(
      textRequiresNativeTexEngine("\\includegraphics{a.png}", undefined)
    ).toBe(true);
  });

  it("routes when text contains multiple user macros", () => {
    const userMacros = new Set(["foo", "bar"]);
    expect(
      textRequiresNativeTexEngine("prefix \\bar{x} suffix", userMacros)
    ).toBe(true);
  });

  it("empty macro set behaves like undefined (no routing beyond includegraphics)", () => {
    expect(textRequiresNativeTexEngine("\\foo{x}", new Set())).toBe(false);
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
