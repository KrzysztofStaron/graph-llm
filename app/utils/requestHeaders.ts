import { getOrCreateClientId } from './clientId';
import { getOrCreateTraceId } from './traceId';

/**
 * Get standard request headers including trace ID and client ID
 */
export function getRequestHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
  const traceId = getOrCreateTraceId();
  const headers: Record<string, string> = {
    'X-Client-Id': getOrCreateClientId(),
    'X-Trace-Id': traceId,
    ...additionalHeaders,
  };
  return headers;
}

