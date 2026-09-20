import type { SpawnType } from "./parseSpawnChoice";
import { isSpawnType } from "./parseSpawnChoice";

export const ESTIMATE_SPAWN_TIMEOUT_MS = 400;

export type EstimateSpawnResult =
  | { ok: true; type: SpawnType; probabilities?: Record<SpawnType, number> }
  | { ok: false; error: string };

export async function estimateSpawn(args: {
  prompt: string;
  contextPreview?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<EstimateSpawnResult> {
  const timeoutMs = args.timeoutMs ?? ESTIMATE_SPAWN_TIMEOUT_MS;
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  const onCallerAbort = () => timeoutController.abort();
  args.signal?.addEventListener("abort", onCallerAbort);
  if (args.signal?.aborted) {
    timeoutController.abort();
  }

  const fetchResult = await fetch("/api/estimate-spawn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: args.prompt,
      contextPreview: args.contextPreview,
    }),
    signal: timeoutController.signal,
  }).then(
    (response): { ok: true; response: Response } => ({ ok: true, response }),
    (error: unknown): { ok: false; error: string } => ({
      ok: false,
      error:
        error instanceof Error && error.name === "AbortError"
          ? `estimate-spawn timed out after ${timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : String(error),
    })
  );

  clearTimeout(timeoutId);
  args.signal?.removeEventListener("abort", onCallerAbort);

  if (!fetchResult.ok) {
    return fetchResult;
  }

  const { response } = fetchResult;
  if (!response.ok) {
    const body: unknown = await response.json().then(
      (value) => value,
      () => null
    );
    const error =
      typeof body === "object" &&
      body !== null &&
      typeof (body as Record<string, unknown>).error === "string"
        ? ((body as Record<string, unknown>).error as string)
        : `estimate-spawn failed (${response.status})`;
    return { ok: false, error };
  }

  const body: unknown = await response.json().then(
    (value) => value,
    () => null
  );
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid estimate-spawn response" };
  }

  const record = body as Record<string, unknown>;
  if (typeof record.type !== "string" || !isSpawnType(record.type)) {
    return { ok: false, error: "estimate-spawn returned unknown type" };
  }

  const probabilities =
    typeof record.probabilities === "object" && record.probabilities !== null
      ? (record.probabilities as Record<SpawnType, number>)
      : undefined;

  return { ok: true, type: record.type, probabilities };
}

/**
 * Wait up to timeoutMs for an estimate. On timeout or failure, default to text.
 */
export async function estimateSpawnOrText(args: {
  prompt: string;
  contextPreview?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<SpawnType> {
  const result = await estimateSpawn(args);
  if (result.ok) return result.type;
  return "text";
}
