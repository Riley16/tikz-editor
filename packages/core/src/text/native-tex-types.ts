/**
 * Request handed to an injected native-TeX compile function. The caller
 * (typically the native engine) is responsible for producing a complete
 * standalone `.tex` document — the compile fn only runs a TeX pipeline and
 * returns SVG. Keeping wrapping in TypeScript (rather than the Rust command)
 * means the wrapping logic stays unit-testable in the core package.
 */
export type NativeTexCompileRequest = {
  source: string;
  /**
   * Directory used as the compile cwd for resolving relative asset paths
   * (e.g. `\includegraphics{plot.png}` when the user edits a saved `.tex`).
   * A null value means the compiler is free to choose a tempdir.
   */
  workingDirectory: string | null;
};

export type NativeTexCompileError = {
  ok: false;
  /**
   * `toolchain-missing` — TeX distribution not detected on the host.
   *   Surface a one-time UI hint pointing at install instructions.
   * `compile-failed` — pdflatex/dvisvgm exited non-zero on well-formed input.
   *   Surface `logTail` so users can fix their fragment.
   * `runtime-error` — unexpected transport-level failure (IPC, permissions,
   *   panic). Not the user's fault; log and retry on next content edit.
   */
  kind: "toolchain-missing" | "compile-failed" | "runtime-error";
  message: string;
  logTail?: string;
};

export type NativeTexCompileSuccess = {
  ok: true;
  svg: string;
};

export type NativeTexCompileResult = NativeTexCompileSuccess | NativeTexCompileError;

export type NativeTexCompileFn = (
  request: NativeTexCompileRequest
) => Promise<NativeTexCompileResult>;

/**
 * Optional mtime probe. When provided, the native engine folds the mtimes of
 * referenced image assets into its cache key so regenerating a PNG on disk
 * invalidates the previously-cached compile output for that fragment.
 * Absent probes mean "no asset watching" — the engine falls back to a
 * source-only cache key.
 */
export type NativeTexAssetMtimeReader = (relativePath: string) => Promise<number | null>;
