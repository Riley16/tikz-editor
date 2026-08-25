import type {
  NativeTexAssetMtimeReader,
  NativeTexCompileFn,
  NativeTexCompileResult
} from "./native-tex-types.js";
import type {
  NodeTextEngine,
  NodeTextMeasureRequest,
  NodeTextMetrics,
  NodeTextRenderPayload,
  NodeTextValidationIssue
} from "./types.js";
import { collectIncludeGraphicsPaths } from "./native-tex-detect.js";

// The `dvisvgm` class option selects the dvisvgm graphics/color drivers so
// `\includegraphics{...}` produces the special DVI commands dvisvgm knows how
// to translate into <image> tags (with Ghostscript to decode the raster). We
// deliberately do not use `[tikz]` here — that option is intended for the
// pdflatex/luatex PDF-output pipelines and breaks includegraphics under the
// dvi-mode `latex` compiler this engine's default compile fn drives.
const DEFAULT_STANDALONE_PREAMBLE = String.raw`\documentclass[dvisvgm,border=0pt]{standalone}
\usepackage{tikz}
\usepackage{graphicx}
`;

const NATIVE_TEX_CACHE_KEY_PREFIX = "native-tex:";
const RENDER_CACHE_LIMIT = 256;
const VALIDATION_CACHE_LIMIT = 1024;

type CachedRender = {
  payload: NodeTextRenderPayload;
  widthPt: number;
  heightPt: number;
};

export type NativeTexEngineOptions = {
  compile: NativeTexCompileFn;
  /**
   * Directory used when resolving relative asset paths in
   * `\includegraphics{...}`. Typically the directory of the open `.tex` file.
   * `null` means the compiler picks a tempdir (no relative-asset support).
   */
  workingDirectory: string | null;
  /**
   * Optional mtime probe folded into the cache key. Without one, regenerating
   * an image file on disk will not invalidate the cached compile output —
   * fine for the web/testing case; wired up on desktop via a small IPC probe.
   */
  mtimeReader?: NativeTexAssetMtimeReader;
  /**
   * Override the LaTeX preamble injected around each fragment. Bypasses the
   * standalone-tikz default entirely — intended for tests / non-standalone
   * document classes. Most callers should use `userPreamble` instead.
   */
  preamble?: string;
  /**
   * Additive user-authored preamble content threaded from the parent
   * document's `\usepackage`s / `\newcommand`s / `\tikzset`s. Appended after
   * the default standalone preamble so user macros are in scope when the
   * fragment compiles. Folded into the cache key — editing the preamble
   * invalidates every cached fragment for this engine.
   */
  userPreamble?: string;
  /**
   * Called at most once per unique failure kind. Used by the app shell to
   * surface a single non-repeating diagnostic (e.g. "TeX not detected") rather
   * than one per fragment.
   */
  onCompileFailure?: (result: Extract<NativeTexCompileResult, { ok: false }>) => void;
};

/**
 * Build a NodeTextEngine implementation that compiles each unique fragment
 * once via the injected `compile` function and caches the resulting SVG for
 * subsequent renders. Follows the MathJax engine's cache-miss + async-flush
 * pattern (returns null from measure() on a miss, populates the cache in the
 * background, exposes new keys via flushPending()).
 */
export function createNativeTexNodeTextEngine(opts: NativeTexEngineOptions): NodeTextEngine {
  const basePreamble = opts.preamble ?? DEFAULT_STANDALONE_PREAMBLE;
  const userPreamble = opts.userPreamble?.trim() ?? "";
  const preamble = userPreamble.length > 0 ? `${basePreamble}${userPreamble}\n` : basePreamble;
  // Cache-key salt so fragments compiled against different preambles never
  // collide. The engine is normally recreated on preamble change (which
  // creates a fresh cache anyway), but salting is a cheap defense against
  // reuse bugs.
  const preambleSalt = simpleHash(preamble);
  const renderCache = new Map<string, CachedRender>();
  const validationCache = new Map<string, NodeTextValidationIssue | null>();
  const inFlightCompiles = new Map<string, Promise<void>>();
  const pendingWork = new Set<Promise<void>>();
  const finalizedPendingKeys = new Set<string>();
  const surfacedFailureKinds = new Set<string>();

  function surfaceFailure(result: Extract<NativeTexCompileResult, { ok: false }>): void {
    if (surfacedFailureKinds.has(result.kind)) {
      return;
    }
    surfacedFailureKinds.add(result.kind);
    opts.onCompileFailure?.(result);
  }

  async function computeCacheKey(text: string): Promise<string> {
    const parts: string[] = [`preamble=${preambleSalt}`, text];
    if (opts.workingDirectory != null) {
      parts.push(`cwd=${opts.workingDirectory}`);
    }
    if (opts.mtimeReader) {
      for (const relativePath of collectIncludeGraphicsPaths(text)) {
        const mtime = await opts.mtimeReader(relativePath);
        parts.push(`mtime:${relativePath}=${mtime ?? "missing"}`);
      }
    }
    return `${NATIVE_TEX_CACHE_KEY_PREFIX}${simpleHash(parts.join("|"))}`;
  }

  function wrapFragment(text: string): string {
    return `${preamble}\\begin{document}\n\\begin{tikzpicture}\n\\node[inner sep=0pt]{${text}};\n\\end{tikzpicture}\n\\end{document}\n`;
  }

  function trackWork(task: Promise<void>): void {
    pendingWork.add(task);
    void task.finally(() => {
      pendingWork.delete(task);
    });
  }

  function scheduleCompile(cacheKey: string, text: string): void {
    if (renderCache.has(cacheKey) || inFlightCompiles.has(cacheKey)) {
      return;
    }
    const task = (async () => {
      try {
        const compileResult = await opts.compile({
          source: wrapFragment(text),
          workingDirectory: opts.workingDirectory
        });
        if (!compileResult.ok) {
          surfaceFailure(compileResult);
          return;
        }
        const parsed = parseSvgPayload(compileResult.svg, cacheKey);
        if (!parsed) {
          surfaceFailure({
            ok: false,
            kind: "runtime-error",
            message: "Native TeX compile returned SVG without a parseable viewBox."
          });
          return;
        }
        setCappedMapValue(renderCache, cacheKey, parsed, RENDER_CACHE_LIMIT);
        finalizedPendingKeys.add(cacheKey);
      } catch (error) {
        surfaceFailure({
          ok: false,
          kind: "runtime-error",
          message: error instanceof Error ? error.message : String(error)
        });
      } finally {
        inFlightCompiles.delete(cacheKey);
      }
    })();
    inFlightCompiles.set(cacheKey, task);
    trackWork(task);
  }

  return {
    validate(text: string): NodeTextValidationIssue | null {
      if (validationCache.has(text)) {
        return validationCache.get(text) ?? null;
      }
      // Native TeX validation is best-effort: we accept the input optimistically
      // and let the async compile surface real errors as diagnostics rather
      // than blocking the parse phase on a compile round-trip.
      setCappedMapValue(validationCache, text, null, VALIDATION_CACHE_LIMIT);
      return null;
    },

    measure(request: NodeTextMeasureRequest): NodeTextMetrics | null {
      const scale = computeFontScale(request.fontSizePt);
      const cacheKeyPromise = computeCacheKey(request.text);
      // Both the mtime-aware and mtime-free paths need to resolve the cache
      // key before we can decide hit vs miss. In the mtime-free case
      // (workingDirectory only, no reader), the promise resolves synchronously
      // on the first microtask — but measure() must be sync per the interface.
      // Resolve the key using a small sync fast path when possible.
      const fastKey = tryComputeCacheKeySync(
        request.text,
        opts.workingDirectory,
        opts.mtimeReader != null,
        preambleSalt
      );
      if (fastKey != null) {
        return measureWithKey(fastKey, request, scale);
      }
      // Slow path (mtime probe outstanding): resolve the cache key in the
      // background then schedule the compile. Track the whole chain so
      // flushPending awaits the mtime probe too, not just the compile.
      const chained = (async () => {
        const key = await cacheKeyPromise;
        if (renderCache.has(key) || inFlightCompiles.has(key)) {
          return;
        }
        scheduleCompile(key, request.text);
        const inFlight = inFlightCompiles.get(key);
        if (inFlight) {
          await inFlight;
        }
      })();
      trackWork(chained);
      return null;

      function measureWithKey(
        cacheKey: string,
        req: NodeTextMeasureRequest,
        fontScale: number
      ): NodeTextMetrics | null {
        const hit = renderCache.get(cacheKey);
        if (!hit) {
          scheduleCompile(cacheKey, req.text);
          return null;
        }
        const width = hit.widthPt * fontScale;
        const height = hit.heightPt * fontScale;
        return {
          cacheKey,
          width,
          height,
          baselineY: -height / 2,
          midLineY: 0,
          paragraphId: null,
          renderSourceText: req.text
        };
      }
    },

    renderFromCache(cacheKey: string): NodeTextRenderPayload | null {
      if (!cacheKey.startsWith(NATIVE_TEX_CACHE_KEY_PREFIX)) {
        return null;
      }
      return renderCache.get(cacheKey)?.payload ?? null;
    },

    async flushPending(): Promise<readonly string[]> {
      while (pendingWork.size > 0) {
        const batch = [...pendingWork];
        await Promise.allSettled(batch);
      }
      if (finalizedPendingKeys.size === 0) {
        return [];
      }
      const keys = [...finalizedPendingKeys].sort();
      finalizedPendingKeys.clear();
      return keys;
    }
  };
}

/**
 * When no mtime probe is registered the cache key is a pure function of the
 * text + cwd, so it can be resolved synchronously and the measure() call can
 * short-circuit to the cache without a microtask hop.
 */
function tryComputeCacheKeySync(
  text: string,
  workingDirectory: string | null,
  hasMtimeReader: boolean,
  preambleSalt: string
): string | null {
  if (hasMtimeReader) {
    return null;
  }
  const parts: string[] = [`preamble=${preambleSalt}`, text];
  if (workingDirectory != null) {
    parts.push(`cwd=${workingDirectory}`);
  }
  return `${NATIVE_TEX_CACHE_KEY_PREFIX}${simpleHash(parts.join("|"))}`;
}

function computeFontScale(fontSizePt: number): number {
  if (!Number.isFinite(fontSizePt) || fontSizePt <= 0) {
    return 1;
  }
  // MathJax normalizes to 10pt as the natural size; keep the same convention
  // so downstream layout math handles both engines the same way.
  return fontSizePt / 10;
}

function parseSvgPayload(svg: string, cacheKey: string): CachedRender | null {
  const viewBox = extractViewBox(svg);
  if (!viewBox) {
    return null;
  }
  const body = extractSvgInnerContent(svg);
  return {
    payload: {
      cacheKey,
      viewBox,
      body
    },
    // dvisvgm's default SVG unit is 1bp = 1pt (near-exact — bp is 72 per inch,
    // pt is 72.27 per inch, difference ~0.4%; acceptable for layout metrics).
    widthPt: viewBox.width,
    heightPt: viewBox.height
  };
}

const VIEWBOX_ATTR_PATTERN = /viewBox=(?:"([^"]+)"|'([^']+)')/;
const WIDTH_PT_PATTERN = /width=['"]([0-9.]+)pt['"]/;
const HEIGHT_PT_PATTERN = /height=['"]([0-9.]+)pt['"]/;
const OPEN_SVG_PATTERN = /<svg\b[^>]*>/;
const CLOSE_SVG_PATTERN = /<\/svg\s*>\s*$/;

function extractViewBox(svg: string): NodeTextRenderPayload["viewBox"] | null {
  const match = svg.match(VIEWBOX_ATTR_PATTERN);
  if (match) {
    const raw = match[1] ?? match[2];
    if (raw) {
      const parts = raw.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
      }
    }
  }
  // dvisvgm sometimes emits width/height in pt without a viewBox attribute; fall
  // back to that so we still get sensible layout metrics.
  const widthMatch = svg.match(WIDTH_PT_PATTERN);
  const heightMatch = svg.match(HEIGHT_PT_PATTERN);
  if (widthMatch && heightMatch) {
    const w = Number(widthMatch[1]);
    const h = Number(heightMatch[1]);
    if (Number.isFinite(w) && Number.isFinite(h)) {
      return { x: 0, y: 0, width: w, height: h };
    }
  }
  return null;
}

function extractSvgInnerContent(svg: string): string {
  const openMatch = svg.match(OPEN_SVG_PATTERN);
  if (!openMatch) {
    return svg;
  }
  const openEnd = (openMatch.index ?? 0) + openMatch[0].length;
  const trimmed = svg.slice(openEnd).replace(CLOSE_SVG_PATTERN, "");
  return trimmed;
}

/**
 * Fast, dependency-free content hash. Not cryptographic — we only need
 * collision resistance across a single editor session's cache namespace.
 */
function simpleHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return combined.toString(36);
}

function setCappedMapValue<K, V>(map: Map<K, V>, key: K, value: V, limit: number): void {
  if (map.has(key)) {
    map.delete(key);
  }
  map.set(key, value);
  while (map.size > limit) {
    const oldest = map.keys().next();
    if (oldest.done) {
      break;
    }
    map.delete(oldest.value);
  }
}
