import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { createNativeTexNodeTextEngine } from "../packages/core/src/text/native-tex-engine.js";
import type {
  NativeTexCompileFn,
  NativeTexCompileResult
} from "../packages/core/src/text/native-tex-types.js";

/**
 * End-to-end integration: drive the native TeX engine with a real
 * `latex` + `dvisvgm` subprocess pipeline (the same one the Tauri command
 * uses on desktop). Guarded to skip cleanly when the toolchain isn't
 * installed so the suite stays green on machines without TeX.
 *
 * The Rust command has additional platform-specific concerns (Ghostscript
 * library discovery, IPC transport) not exercised here; this test proves
 * the pure Node-side pipeline (fragment → wrap → compile → SVG parse →
 * metrics + cached payload) works with real TeX output.
 */

function commandExists(cmd: string): boolean {
  const check = spawnSync("sh", ["-lc", `command -v ${cmd}`], { encoding: "utf8" });
  return check.status === 0;
}

function findLibgs(): string | null {
  const candidates = [
    "/usr/local/lib/libgs.dylib",
    "/opt/homebrew/lib/libgs.dylib"
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  const cellars = ["/usr/local/Cellar/ghostscript", "/opt/homebrew/Cellar/ghostscript"];
  for (const base of cellars) {
    if (!existsSync(base)) continue;
    const readdir = spawnSync("ls", [base], { encoding: "utf8" });
    if (readdir.status !== 0) continue;
    for (const version of readdir.stdout.trim().split("\n")) {
      const candidate = `${base}/${version}/lib/libgs.dylib`;
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Fake the Rust command in Node: same shape as the injected compile fn on
 * desktop, but uses child_process.spawnSync so we can run it directly under
 * vitest without a Tauri harness. Deliberately mirrors the pipeline in
 * `desktop_compile_tex_fragment` (latex → dvisvgm with LIBGS + TEXINPUTS,
 * then base64-inline referenced images) to catch pipeline drift between
 * the two implementations.
 */
function createNodeCompileFn(): NativeTexCompileFn {
  const libgs = findLibgs();
  return async ({ source, workingDirectory }): Promise<NativeTexCompileResult> => {
    const workDir = mkdtempSync(join(tmpdir(), "native-tex-integration-"));
    try {
      const texPath = join(workDir, "input.tex");
      writeFileSync(texPath, source, "utf8");

      const env: NodeJS.ProcessEnv = { ...process.env };
      if (workingDirectory) {
        env.TEXINPUTS = `${workingDirectory}:${env.TEXINPUTS ?? ""}`;
      }
      if (libgs) {
        env.LIBGS = libgs;
      }

      const latexRun = spawnSync(
        "latex",
        ["-interaction=batchmode", "-file-line-error", "-halt-on-error", "input.tex"],
        { cwd: workDir, env, encoding: "utf8" }
      );
      if (latexRun.status !== 0) {
        return {
          ok: false,
          kind: "compile-failed",
          message: `latex exited ${latexRun.status}`,
          logTail: (latexRun.stdout ?? "") + (latexRun.stderr ?? "")
        };
      }

      const dviPath = join(workDir, "input.dvi");
      if (!existsSync(dviPath)) {
        return { ok: false, kind: "runtime-error", message: "no dvi produced" };
      }

      const svgOut = join(workDir, "output.svg");
      const dvisvgmRun = spawnSync(
        "dvisvgm",
        ["--page=1", "--bbox=min", "--exact", "--font-format=woff2", "-o", "output.svg", "input.dvi"],
        { cwd: workDir, env, encoding: "utf8" }
      );
      if (dvisvgmRun.status !== 0 || !existsSync(svgOut)) {
        return {
          ok: false,
          kind: "compile-failed",
          message: `dvisvgm exited ${dvisvgmRun.status}`
        };
      }

      let svg = readFileSync(svgOut, "utf8");
      // Mirror the Rust-side image-inlining post-process so the fragment is
      // self-contained. Only handles xlink:href / href with local file paths.
      svg = svg.replace(
        /(xlink:href|href)=(['"])([^'"]+)\2/g,
        (_match, attr, quote, value) => {
          if (
            !value ||
            value.startsWith("data:") ||
            value.startsWith("http:") ||
            value.startsWith("https:") ||
            value.startsWith("file:") ||
            value.startsWith("#")
          ) {
            return `${attr}=${quote}${value}${quote}`;
          }
          const resolveDir = workingDirectory ?? workDir;
          const filePath = join(resolveDir, value);
          if (!existsSync(filePath)) {
            return `${attr}=${quote}${value}${quote}`;
          }
          const bytes = readFileSync(filePath);
          const mime = value.toLowerCase().endsWith(".png")
            ? "image/png"
            : value.toLowerCase().endsWith(".jpg") ||
              value.toLowerCase().endsWith(".jpeg")
              ? "image/jpeg"
              : "application/octet-stream";
          return `${attr}=${quote}data:${mime};base64,${bytes.toString("base64")}${quote}`;
        }
      );

      return { ok: true, svg };
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  };
}

function makeTinyPng(): Buffer {
  // 1x1 red PNG, hand-encoded. Small enough to inline in the test.
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "base64"
  );
}

const toolchainReady = commandExists("latex") && commandExists("dvisvgm");

describe.skipIf(!toolchainReady)("native TeX engine (integration with real latex+dvisvgm)", () => {
  it("compiles a plain-text fragment end-to-end and returns metrics + payload", async () => {
    const engine = createNativeTexNodeTextEngine({
      compile: createNodeCompileFn(),
      workingDirectory: null
    });

    const request = {
      text: "Hi",
      mode: "text" as const,
      textWidthPt: null,
      fontStyle: "normal" as const,
      fontWeight: "normal" as const,
      fontFamily: "serif" as const,
      fontSizePt: 10
    };

    expect(engine.measure(request)).toBeNull();
    const flushed = (await engine.flushPending?.()) ?? [];
    expect(flushed.length).toBe(1);

    const metrics = engine.measure(request);
    expect(metrics).not.toBeNull();
    expect(metrics!.width).toBeGreaterThan(0);
    expect(metrics!.height).toBeGreaterThan(0);
    const payload = engine.renderFromCache(metrics!.cacheKey);
    expect(payload).not.toBeNull();
    expect(payload!.viewBox.width).toBeGreaterThan(0);
    expect(payload!.viewBox.height).toBeGreaterThan(0);
    expect(payload!.body.length).toBeGreaterThan(0);
  }, 30_000);

  it("compiles a fragment using a user-defined macro when preamble is threaded", async () => {
    const engine = createNativeTexNodeTextEngine({
      compile: createNodeCompileFn(),
      workingDirectory: null,
      userPreamble: "\\newcommand{\\myGreeting}{Hi from a user macro}"
    });

    const request = {
      text: "\\myGreeting",
      mode: "text" as const,
      textWidthPt: null,
      fontStyle: "normal" as const,
      fontWeight: "normal" as const,
      fontFamily: "serif" as const,
      fontSizePt: 10
    };

    expect(engine.measure(request)).toBeNull();
    await engine.flushPending?.();
    const metrics = engine.measure(request);
    expect(metrics).not.toBeNull();
    expect(metrics!.width).toBeGreaterThan(0);
    const payload = engine.renderFromCache(metrics!.cacheKey);
    expect(payload).not.toBeNull();
    // The rendered SVG should contain glyphs — proof the macro expanded and
    // the compiler produced actual output for it (not just an empty box).
    expect(payload!.body.length).toBeGreaterThan(50);
  }, 30_000);

  it("resolves and inlines a referenced PNG when workingDirectory is provided", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "native-tex-integration-fixture-"));
    try {
      const imageName = "tiny.png";
      writeFileSync(join(workDir, imageName), makeTinyPng());

      const engine = createNativeTexNodeTextEngine({
        compile: createNodeCompileFn(),
        workingDirectory: workDir
      });

      const request = {
        text: `\\includegraphics[width=1cm]{${basename(imageName)}}`,
        mode: "text" as const,
        textWidthPt: null,
        fontStyle: "normal" as const,
        fontWeight: "normal" as const,
        fontFamily: "serif" as const,
        fontSizePt: 10
      };

      expect(engine.measure(request)).toBeNull();
      await engine.flushPending?.();
      const metrics = engine.measure(request);
      expect(metrics).not.toBeNull();
      const payload = engine.renderFromCache(metrics!.cacheKey);
      expect(payload).not.toBeNull();
      // Requires libgs so dvisvgm actually emitted the image tag; if not
      // present the SVG has no <image> at all — assert only the payload
      // succeeded and let the presence of base64 be a separate check.
      if (findLibgs() != null) {
        expect(payload!.body).toContain("data:image/png;base64,");
      }
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }, 60_000);
});
