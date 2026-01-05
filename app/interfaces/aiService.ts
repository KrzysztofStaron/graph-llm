import { globals } from "../globals";
import { getOrCreateClientId } from "../utils/clientId";
import logger from "../utils/logger";

// Content types for multi-modal messages
type TextContentPart = { type: "text"; text: string };
type ImageContentPart = {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
};
type ContentPart = TextContentPart | ImageContentPart;

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
};

export class aiService {
  static async chat(
    message: string | ChatMessage[],
    options?: {
      model?: string;
      provider?: {
        sort?: "latency" | "price" | "throughput";
        allow_fallbacks?: boolean;
      };
    }
  ): Promise<string> {
    let response: Response;

    try {
      response = await fetch(`${globals.graphLLMBackendUrl}/api/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Id": getOrCreateClientId(),
        },
        body: JSON.stringify({
          messages: Array.isArray(message)
            ? message
            : [{ role: "user", content: message }],
          ...(options?.model && { model: options.model }),
          ...(options?.provider && { provider: options.provider }),
        }),
      });
    } catch (error) {
      // Differentiate between network errors and other issues
      if (error instanceof TypeError) {
        // TypeError typically indicates network failure, CORS, or DNS issues
        const networkError = new Error(
          `Network error: Cannot reach ${globals.graphLLMBackendUrl}. Check your connection or server status.`
        );
        logger.error("Network error in chat", { error, originalError: error });
        throw networkError;
      }

      logger.error("Error in chat", { error });
      // Re-throw other errors as-is
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      const error = new Error(
        `Server error (${response.status}): ${errorText || response.statusText}`
      );
      logger.error("Backend error in chat", { 
        status: response.status, 
        statusText: response.statusText, 
        errorText,
        error 
      });
      throw error;
    }

    return response.text();
  }

  static async streamChat(
    message: string | ChatMessage[],
    onChunk: (chunk: string) => void,
    options?: {
      model?: string;
      provider?: {
        sort?: "latency" | "price" | "throughput";
        allow_fallbacks?: boolean;
      };
      timeoutMs?: number;
    }
  ): Promise<string> {
    // Feature detection: check if streaming is supported
    const supportsStreaming =
      typeof ReadableStream !== "undefined" &&
      typeof TextDecoder !== "undefined" &&
      typeof Response !== "undefined";

    // If streaming is not supported, fall back to non-streaming endpoint
    if (!supportsStreaming) {
      console.warn(
        "Streaming not supported in this browser, falling back to non-streaming endpoint"
      );
      const result = await this.chat(message, options);
      onChunk(result);
      return result;
    }

    const payload = JSON.stringify({
      messages: Array.isArray(message)
        ? message
        : [{ role: "user", content: message }],
      ...(options?.model && { model: options.model }),
      ...(options?.provider && { provider: options.provider }),
    });

    const TIMEOUT_MS = options?.timeoutMs || 120000; // 2 minutes default timeout
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUT_MS);

    let response: Response;

    try {
      response = await fetch(
        `${globals.graphLLMBackendUrl}/api/v1/chat/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Client-Id": getOrCreateClientId(),
          },
          body: payload,
          signal: timeoutController.signal,
        }
      );
    } catch (fetchError) {
      // Handle specific error types
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        const timeoutError = new Error(`Request timeout after ${TIMEOUT_MS / 1000} seconds`);
        logger.error("Request timeout in streamChat", { error: fetchError, timeoutMs: TIMEOUT_MS });
        throw timeoutError;
      }
      if (fetchError instanceof TypeError) {
        // TypeError typically indicates network failure, CORS, or DNS issues
        const networkError = new Error(
          `Network error: Cannot reach ${globals.graphLLMBackendUrl}. Check your connection or server status.`
        );
        logger.error("Network error in streamChat", { error: fetchError, originalError: fetchError });
        throw networkError;
      }
      // Re-throw other errors as-is
      logger.error("Fetch error in streamChat", { error: fetchError });
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      const error = new Error(
        `Server error (${response.status}): ${errorText || response.statusText}`
      );
      logger.error("Backend error in streamChat", { 
        status: response.status, 
        statusText: response.statusText, 
        errorText,
        error 
      });
      throw error;
    }

    // Additional check: if response.body or getReader is not available, fall back
    if (!response.body || typeof response.body.getReader !== "function") {
      console.warn(
        "Response body streaming not available, falling back to non-streaming"
      );
      clearTimeout(timeoutId);
      const result = await response.text();
      onChunk(result);
      return result;
    }

    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      let fullResponse = "";
      let lastUpdateTime = 0;
      let pendingUpdate = false;
      const THROTTLE_MS = 500;

      const throttledOnChunk = (content: string) => {
        const now = Date.now();
        if (now - lastUpdateTime >= THROTTLE_MS) {
          onChunk(content);

          lastUpdateTime = now;
          pendingUpdate = false;
        } else {
          pendingUpdate = true;
        }
      };

      try {
        let lastChunkTime = Date.now();
        const INACTIVITY_TIMEOUT_MS = 30000; // 30 seconds of no data

        while (true) {
          // Check for inactivity timeout
          if (Date.now() - lastChunkTime > INACTIVITY_TIMEOUT_MS) {
            const timeoutError = new Error("Stream timeout: No data received for 30 seconds");
            logger.error("Stream inactivity timeout", { 
              error: timeoutError, 
              inactivityTimeoutMs: INACTIVITY_TIMEOUT_MS 
            });
            throw timeoutError;
          }

          const { done, value } = await reader.read();

          if (done) {
            // Stream ended without [DONE] signal - treat as complete
            if (fullResponse.length > 0) {
              if (pendingUpdate) {
                onChunk(fullResponse);
              }
              return fullResponse;
            }
            const streamError = new Error("Stream ended without any content");
            logger.error("Stream ended without content", { error: streamError });
            throw streamError;
          }

          lastChunkTime = Date.now();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                if (pendingUpdate) {
                  onChunk(this.cleanResponse(fullResponse));
                }
                return this.cleanResponse(fullResponse);
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullResponse += parsed.content;
                  throttledOnChunk(this.cleanResponse(fullResponse));
                }
                if (parsed.error) {
                  const streamError = new Error(parsed.error);
                  logger.error("Stream error from backend", { error: streamError, parsedError: parsed.error });
                  throw streamError;
                }
              } catch (parseError) {
                // Skip invalid JSON but log it for debugging
                logger.warn("Failed to parse SSE data", { data, error: parseError });
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  static cleanResponse(response: string) {
    // Remove <node ...>...</node> if response is wrapped in those tags (including attributes)
    const trimmed = response.trim();
    const match = trimmed.match(/^<node[^>]*>([\s\S]*?)<\/node>$/i);
    if (match) {
      console.log("cleanResponse", match[1].trim());
      return match[1].trim();
    }
    return response;
  }
}
