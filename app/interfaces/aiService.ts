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

    const rawText = await response.text();
    return this.cleanResponse(rawText);
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
      retries?: number;
    }
  ): Promise<string> {
    const maxRetries = options?.retries ?? 2;
    let lastError: Error | null = null;

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

    // Retry logic with exponential backoff
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        logger.info(`Retrying streamChat (attempt ${attempt + 1}/${maxRetries + 1}) after ${backoffMs}ms`, {
          lastError: lastError?.message,
        });
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }

      const result = await this._attemptStreamChat(message, onChunk, options);
      if (result.success) {
        return result.data;
      }

      lastError = result.error;
      
      // Only retry on "Stream ended without any content" errors
      if (!result.error.message.includes("Stream ended without any content")) {
        throw result.error;
      }
      
      if (attempt === maxRetries) {
        logger.error("All retry attempts exhausted for streamChat", {
          attempts: maxRetries + 1,
          lastError: lastError.message,
        });
        throw lastError;
      }
    }

    throw lastError || new Error("Unknown error in streamChat");
  }

  private static async _attemptStreamChat(
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
  ): Promise<{ success: true; data: string } | { success: false; error: Error }> {

    try {
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
        clearTimeout(timeoutId);
        // Handle specific error types
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          const timeoutError = new Error(`Request timeout after ${TIMEOUT_MS / 1000} seconds`);
          logger.error("Request timeout in streamChat", { error: fetchError, timeoutMs: TIMEOUT_MS });
          return { success: false, error: timeoutError };
        }
        if (fetchError instanceof TypeError) {
          // TypeError typically indicates network failure, CORS, or DNS issues
          const networkError = new Error(
            `Network error: Cannot reach ${globals.graphLLMBackendUrl}. Check your connection or server status.`
          );
          logger.error("Network error in streamChat", { error: fetchError, originalError: fetchError });
          return { success: false, error: networkError };
        }
        // Re-throw other errors as-is
        logger.error("Fetch error in streamChat", { error: fetchError });
        return { success: false, error: fetchError instanceof Error ? fetchError : new Error(String(fetchError)) };
      }

      if (!response.ok) {
        clearTimeout(timeoutId);
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
        return { success: false, error };
      }

      // Additional check: if response.body or getReader is not available, fall back
      if (!response.body || typeof response.body.getReader !== "function") {
        console.warn(
          "Response body streaming not available, falling back to non-streaming"
        );
        clearTimeout(timeoutId);
        const rawResult = await response.text();
        const cleanedResult = this.cleanResponse(rawResult);
        onChunk(cleanedResult);
        return { success: true, data: cleanedResult };
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
              return { success: false, error: timeoutError };
            }

            const { done, value } = await reader.read();

            if (done) {
              // Stream ended without [DONE] signal - clean and return
              if (fullResponse.length === 0) {
                const streamError = new Error(
                  "Stream ended without any content. This may happen if the LLM provider rejected the request or returned an empty response. Retrying..."
                );
                logger.error("Stream ended without content (empty fullResponse)", { 
                  error: streamError,
                  messagePreview: Array.isArray(message) 
                    ? message.map(m => ({
                        role: m.role,
                        contentPreview: typeof m.content === 'string' 
                          ? m.content.substring(0, 300) 
                          : '[multipart]'
                      }))
                    : typeof message === 'string' ? message.substring(0, 300) : '[unknown]',
                  buffer: buffer.substring(0, 500),
                });
                return { success: false, error: streamError };
              }
              
              const cleanedResponse = this.cleanResponse(fullResponse);
              if (pendingUpdate) {
                onChunk(cleanedResponse);
              }
              return { success: true, data: cleanedResponse };
            }

            lastChunkTime = Date.now();
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") {
                  const cleanedResponse = this.cleanResponse(fullResponse);
                  if (pendingUpdate) {
                    onChunk(cleanedResponse);
                  }
                  return { success: true, data: cleanedResponse };
                }

                try {
                  const parsed = JSON.parse(data);
                  if (parsed.content) {
                    fullResponse += parsed.content;
                    throttledOnChunk(fullResponse);
                  }
                  if (parsed.error) {
                    const streamError = new Error(parsed.error);
                    logger.error("Stream error from backend", { error: streamError, parsedError: parsed.error });
                    return { success: false, error: streamError };
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
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error)) 
      };
    }
  }

  static cleanResponse(response: string): string {
    if (!response || response.trim().length === 0) {
      return response;
    }
    
    let cleaned = response.trim();
    const originalLength = cleaned.length;
    
    // Pattern 1: Remove opening and closing node tags if response is fully wrapped
    // Handles: <node ...>content</node>
    const fullWrapMatch = cleaned.match(/^<node[^>]*>([\s\S]*?)<\/node>$/i);
    if (fullWrapMatch) {
      const extracted = fullWrapMatch[1].trim();
      if (extracted.length > 0) {
        logger.warn("Model leaked node tags (full wrap) - cleaning response", {
          original: cleaned.substring(0, 200),
          cleaned: extracted.substring(0, 200)
        });
        cleaned = extracted;
      } else {
        // Empty node tags - log but continue to other cleaning patterns
        logger.warn("Model sent empty node tags - keeping original", {
          original: cleaned.substring(0, 200)
        });
      }
    }
    
    // Pattern 2: Remove any remaining node tags (opening or closing) anywhere in response
    // This catches partial leaks or multiple nodes
    const beforeClean = cleaned;
    cleaned = cleaned
      .replace(/<node[^>]*>/gi, '') // Remove all opening tags
      .replace(/<\/node>/gi, ''); // Remove all closing tags
    
    if (beforeClean !== cleaned) {
      logger.warn("Model leaked partial node tags - cleaning response", {
        original: beforeClean.substring(0, 200),
        cleaned: cleaned.substring(0, 200)
      });
    }
    
    // Pattern 3: Remove separator tags
    const beforeSeparatorClean = cleaned;
    cleaned = cleaned.replace(/<separatorOfContextualData\s*\/>/gi, '');
    
    if (beforeSeparatorClean !== cleaned) {
      logger.warn("Model leaked separator tags - cleaning response");
    }
    
    // Final trim
    cleaned = cleaned.trim();
    
    // Safety check: If cleaning removed everything, return original (better than losing content)
    if (cleaned.length === 0 && originalLength > 0) {
      logger.error("Cleaning resulted in empty response - returning original to prevent data loss", {
        original: response.substring(0, 200),
        originalLength: originalLength
      });
      return response.trim();
    }
    
    return cleaned;
  }
}
