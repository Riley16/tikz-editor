import { getSharedTextEngine, hasNativeTexCompilerRegistered } from "../../compute";
import type {
  ThumbnailRenderFailure,
  ThumbnailRenderRequest,
  ThumbnailRenderSuccess,
  ThumbnailWorkerResponseMessage
} from "./thumbnail-worker-types";

type PendingRequest = {
  resolve: (value: ThumbnailRenderSuccess | ThumbnailRenderFailure) => void;
  reject: (reason?: unknown) => void;
  groupId: string;
};

let sharedWorker: Worker | null = null;
let workerInitFailed = false;
const pendingRequests = new Map<string, PendingRequest>();
const requestIdsByGroup = new Map<string, Set<string>>();

function getWorker(): Worker | null {
  if (workerInitFailed) {
    return null;
  }
  if (sharedWorker) {
    return sharedWorker;
  }
  try {
    sharedWorker = new Worker(new URL("./thumbnail-render.worker.ts", import.meta.url), { type: "module" });
    sharedWorker.addEventListener("message", onWorkerMessage as EventListener);
    sharedWorker.addEventListener("error", onWorkerError as EventListener);
    return sharedWorker;
  } catch {
    workerInitFailed = true;
    return null;
  }
}

export async function requestThumbnail(request: ThumbnailRenderRequest): Promise<ThumbnailRenderSuccess | ThumbnailRenderFailure> {
  // When a native TeX compile function is registered, always use the main-
  // thread fallback path so the shared engine's cache is reused. The worker
  // is a separate context that can't invoke Tauri IPC directly — routing
  // there would silent-fail on any macro / \includegraphics fragment, which
  // is exactly the "unrendered latex in thumbnails" bug this avoids.
  //
  // Native compile is offloaded to Rust anyway (Tauri command spawns
  // latex+dvisvgm in a subprocess), so the "main-thread render" path is
  // really just orchestration — the heavy work is off-main.
  if (hasNativeTexCompilerRegistered()) {
    return renderThumbnailFallback(request);
  }

  const worker = getWorker();
  if (!worker) {
    return renderThumbnailFallback(request);
  }

  return new Promise<ThumbnailRenderSuccess | ThumbnailRenderFailure>((resolve, reject) => {
    pendingRequests.set(request.requestId, {
      resolve,
      reject,
      groupId: request.groupId
    });
    const idsForGroup = requestIdsByGroup.get(request.groupId) ?? new Set<string>();
    idsForGroup.add(request.requestId);
    requestIdsByGroup.set(request.groupId, idsForGroup);
    worker.postMessage(request);
  });
}

export function cancelThumbnail(requestId: string): void {
  if (!requestId) {
    return;
  }
  const worker = getWorker();
  const pending = pendingRequests.get(requestId);
  if (pending) {
    pending.reject(new Error("thumbnail-request-cancelled"));
    dropPending(requestId, pending.groupId);
  }
  if (worker) {
    worker.postMessage({
      type: "cancelRequest",
      requestId
    });
  }
}

export function cancelGroup(groupId: string): void {
  if (!groupId) {
    return;
  }
  const worker = getWorker();
  const ids = requestIdsByGroup.get(groupId);
  if (ids) {
    for (const requestId of ids) {
      const pending = pendingRequests.get(requestId);
      if (!pending) {
        continue;
      }
      pending.reject(new Error("thumbnail-group-cancelled"));
      pendingRequests.delete(requestId);
    }
    requestIdsByGroup.delete(groupId);
  }
  if (worker) {
    worker.postMessage({
      type: "cancelGroup",
      groupId
    });
  }
}

function onWorkerMessage(event: MessageEvent<ThumbnailWorkerResponseMessage>): void {
  const message = event.data;
  if (message?.type !== "result") {
    return;
  }
  const pending = pendingRequests.get(message.requestId);
  if (!pending) {
    return;
  }
  dropPending(message.requestId, pending.groupId);
  pending.resolve(message);
}

async function renderThumbnailFallback(request: ThumbnailRenderRequest): Promise<ThumbnailRenderSuccess | ThumbnailRenderFailure> {
  try {
    const { renderTikzToSvgAsync } = await import("tikz-editor/render/index");
    // Reuse the shared text engine so thumbnails hit the same cache the
    // canvas render populated, and so native-only fragments (macros,
    // \includegraphics) render properly here too. When no shared engine is
    // available (web build, or before the app has finished bootstrapping),
    // this resolves to null and renderTikzToSvgAsync falls back to its own
    // default MathJax engine.
    const sharedEngineMaybe = getSharedTextEngine();
    const sharedEngine = sharedEngineMaybe instanceof Promise
      ? await sharedEngineMaybe
      : sharedEngineMaybe;
    const rendered = await renderTikzToSvgAsync(request.source, {
      parse: {
        recover: request.parseOptions.recover ?? true,
        activeFigureId: request.parseOptions.activeFigureId,
        includeContextDefinitions: request.parseOptions.includeContextDefinitions
      },
      svg: {
        padding: request.svgOptions?.padding
      },
      textEngine: sharedEngine ?? undefined
    });
    return {
      type: "result",
      ok: true,
      requestId: request.requestId,
      groupId: request.groupId,
      figureId: request.figureId,
      figureSignature: request.figureSignature,
      svg: rendered.svg.svg
    };
  } catch (error) {
    return {
      type: "result",
      ok: false,
      requestId: request.requestId,
      groupId: request.groupId,
      figureId: request.figureId,
      figureSignature: request.figureSignature,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function onWorkerError(): void {
  if (!sharedWorker) {
    return;
  }
  // Fail fast for currently waiting requests. Subsequent requests use fallback path.
  workerInitFailed = true;
  sharedWorker.terminate();
  sharedWorker = null;
  const pendingIds = [...pendingRequests.keys()];
  for (const requestId of pendingIds) {
    const pending = pendingRequests.get(requestId);
    if (!pending) {
      continue;
    }
    pending.reject(new Error("thumbnail-worker-error"));
    dropPending(requestId, pending.groupId);
  }
}

function dropPending(requestId: string, groupId: string): void {
  pendingRequests.delete(requestId);
  const ids = requestIdsByGroup.get(groupId);
  if (!ids) {
    return;
  }
  ids.delete(requestId);
  if (ids.size === 0) {
    requestIdsByGroup.delete(groupId);
  }
}
