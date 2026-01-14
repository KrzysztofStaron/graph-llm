/**
 * Trace ID utilities for distributed tracing
 * Generates unique trace IDs and manages them across requests
 */

/**
 * Generate a unique trace ID
 * Format: timestamp-random (e.g., "1704067200000-a1b2c3d4")
 */
export function generateTraceId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

/**
 * Get or create a trace ID for the current operation
 * Uses sessionStorage to persist trace IDs across page reloads within the same session
 */
export function getOrCreateTraceId(): string {
  if (typeof window === 'undefined') {
    return generateTraceId();
  }

  const storageKey = 'graph-llm-trace-id';
  const existingTraceId = sessionStorage.getItem(storageKey);
  
  if (existingTraceId) {
    return existingTraceId;
  }

  const newTraceId = generateTraceId();
  sessionStorage.setItem(storageKey, newTraceId);
  return newTraceId;
}

/**
 * Create a new trace ID (useful for starting a new trace)
 */
export function createNewTraceId(): string {
  if (typeof window === 'undefined') {
    return generateTraceId();
  }

  const storageKey = 'graph-llm-trace-id';
  const newTraceId = generateTraceId();
  sessionStorage.setItem(storageKey, newTraceId);
  return newTraceId;
}

/**
 * Get the current trace ID without creating a new one
 */
export function getCurrentTraceId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const storageKey = 'graph-llm-trace-id';
  return sessionStorage.getItem(storageKey);
}

