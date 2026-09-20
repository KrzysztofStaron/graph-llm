export function removedNodeIds(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  const removed: string[] = [];
  for (const id of Object.keys(before)) {
    if (!(id in after)) {
      removed.push(id);
    }
  }
  return removed;
}

export function abortRequestsForNodes(
  abortByNodeId: Map<string, AbortController>,
  nodeIds: string[]
): void {
  for (const id of nodeIds) {
    const controller = abortByNodeId.get(id);
    if (!controller) continue;
    controller.abort();
    abortByNodeId.delete(id);
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) {
    throw signal.reason;
  }
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  throw error;
}
