/**
 * Agent debug feature — pixel-level canvas screenshots triggered by an
 * external file touch, so coding agents driving the app for testing can see
 * what the canvas is rendering without needing OS Screen Recording
 * permissions.
 *
 * Flow:
 *   1. Rust side (see start_agent_screenshot_watcher in lib.rs) watches
 *      `$TMPDIR/tikz-editor-agent-screenshot-request` for the file to be
 *      created (agents `touch` it to request a capture).
 *   2. When the trigger appears, Rust emits a `desktop-agent-screenshot-
 *      request` event to the frontend, carrying the desired output path.
 *   3. This module's listener picks up the event, calls
 *      `captureAppScreenshot()` which serializes the currently-focused
 *      SVG canvas to a PNG via the WebView's own `<canvas>.drawImage()`
 *      rasterizer — the same rendering pipeline used to paint pixels on
 *      screen, so no OS-level screen capture (and no TCC prompt) is
 *      involved.
 *   4. Base64 PNG goes back to Rust via `desktop_write_agent_screenshot`,
 *      which writes the file and deletes the trigger.
 *   5. Agent polls for the output path (or for the trigger's disappearance)
 *      and reads the resulting PNG.
 *
 * Cross-platform: the WebView SVG rasterizer works identically on
 * WKWebView (macOS), WebView2 (Windows), and WebKitGTK (Linux).
 */

const CANVAS_SELECTOR = "[data-testid='canvas-panel-svg'], svg[data-scene-root], .canvas-panel-svg, main svg";

async function captureAppScreenshot(): Promise<string | null> {
  const target = pickCanvasElement();
  if (!target) {
    return null;
  }
  const bounds = target.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  // Serialize the SVG with an inline xmlns declaration in case the live DOM
  // relies on inherited namespaces (browsers are lenient when the SVG is
  // inline; strict during the `new Image()` load below).
  const cloned = target.cloneNode(true) as SVGSVGElement;
  cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  cloned.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  const svgString = new XMLSerializer().serializeToString(cloned);
  const svgDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

  const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
  const pixelWidth = Math.max(1, Math.round(bounds.width * dpr));
  const pixelHeight = Math.max(1, Math.round(bounds.height * dpr));

  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  const image = new Image();
  image.decoding = "sync";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => { resolve(); };
    image.onerror = () => { reject(new Error("agent screenshot: image load failed")); };
    image.src = svgDataUri;
  });
  ctx.drawImage(image, 0, 0, pixelWidth, pixelHeight);

  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}

function pickCanvasElement(): SVGSVGElement | null {
  const candidates = document.querySelectorAll<SVGSVGElement>(CANVAS_SELECTOR);
  let best: SVGSVGElement | null = null;
  let bestArea = 0;
  for (const el of Array.from(candidates)) {
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  if (best) {
    return best;
  }
  // Fallback: largest visible <svg> on the page.
  const allSvg = document.querySelectorAll<SVGSVGElement>("svg");
  for (const el of Array.from(allSvg)) {
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return best;
}

export async function installAgentScreenshotHandler(): Promise<void> {
  const { listen } = await import("@tauri-apps/api/event");
  const { invoke } = await import("@tauri-apps/api/core");
  await listen<string>("desktop-agent-screenshot-request", () => {
    void (async () => {
      try {
        const base64 = await captureAppScreenshot();
        if (!base64) {
          console.warn("[agent-screenshot] no canvas element found");
          return;
        }
        await invoke("desktop_write_agent_screenshot", { pngBase64: base64 });
      } catch (error) {
        console.warn("[agent-screenshot] capture failed:", error);
      }
    })();
  });
}
