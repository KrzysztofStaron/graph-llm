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

// Response types for streaming
export type StreamResponse = 
  | { type: "text"; content: string }
  | { type: "image"; content: string; prompt?: string };

export class aiService {
  static async chat(
    message: string | ChatMessage[],
    options?: {
      model?: string;
      imageModel?: string;
      provider?: {
        sort?: "latency" | "price" | "throughput";
        allow_fallbacks?: boolean;
      };
      webSearchEnabled?: boolean;
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
          ...(options?.imageModel && { imageModel: options.imageModel }),
          ...(options?.provider && { provider: options.provider }),
          ...(options?.webSearchEnabled && { 
            plugins: [
              {
                id: "web",
                max_results: 5,
              }
            ]
          }),
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
    logger.info("Raw response from AI service (non-streaming)", { 
      rawText,
      length: rawText.length 
    });
    return this.cleanResponse(rawText);
  }

  static async streamChat(
    message: string | ChatMessage[],
    onChunk: (chunk: string) => void,
    options?: {
      model?: string;
      imageModel?: string;
      provider?: {
        sort?: "latency" | "price" | "throughput";
        allow_fallbacks?: boolean;
      };
      timeoutMs?: number;
      retries?: number;
      webSearchEnabled?: boolean;
    },
    onImage?: (imageUrl: string, prompt?: string) => void
  ): Promise<StreamResponse> {
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
      return { type: "text", content: result };
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

      const result = await this._attemptStreamChat(message, onChunk, options, onImage);
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
      imageModel?: string;
      provider?: {
        sort?: "latency" | "price" | "throughput";
        allow_fallbacks?: boolean;
      };
      timeoutMs?: number;
      webSearchEnabled?: boolean;
    },
    onImage?: (imageUrl: string, prompt?: string) => void
  ): Promise<{ success: true; data: StreamResponse } | { success: false; error: Error }> {

    try {
      const payload = JSON.stringify({
        messages: Array.isArray(message)
          ? message
          : [{ role: "user", content: message }],
        ...(options?.model && { model: options.model }),
        ...(options?.imageModel && { imageModel: options.imageModel }),
        ...(options?.provider && { provider: options.provider }),
        ...(options?.webSearchEnabled && { 
          plugins: [
            {
              id: "web",
              max_results: 5,
            }
          ]
        }),
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
        logger.info("Raw response from AI service (fallback non-streaming)", { 
          rawResult,
          length: rawResult.length 
        });
        const cleanedResult = this.cleanResponse(rawResult);
        onChunk(cleanedResult);
        return { success: true, data: { type: "text", content: cleanedResult } };
      }

      try {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = "";
        let fullResponse = "";
        let lastUpdateTime = 0;
        let pendingUpdate = false;
        let imageResponse: { url: string; prompt?: string } | null = null;
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
          const INACTIVITY_TIMEOUT_MS = 60000; // 60 seconds of no data (increased for image generation)

          while (true) {
            // Check for inactivity timeout
            if (Date.now() - lastChunkTime > INACTIVITY_TIMEOUT_MS) {
              const timeoutError = new Error("Stream timeout: No data received for 60 seconds");
              logger.error("Stream inactivity timeout", { 
                error: timeoutError, 
                inactivityTimeoutMs: INACTIVITY_TIMEOUT_MS 
              });
              return { success: false, error: timeoutError };
            }

            const { done, value } = await reader.read();

            if (done) {
              // If we got an image response, return it
              if (imageResponse) {
                return { 
                  success: true, 
                  data: { type: "image", content: imageResponse.url, prompt: imageResponse.prompt } 
                };
              }
              
              logger.info("Stream ended - raw fullResponse from AI service", { 
                fullResponse,
                length: fullResponse.length 
              });
              
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
              return { success: true, data: { type: "text", content: cleanedResponse } };
            }

            lastChunkTime = Date.now();
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") {
                  // If we got an image response, return it
                  if (imageResponse) {
                    return { 
                      success: true, 
                      data: { type: "image", content: imageResponse.url, prompt: imageResponse.prompt } 
                    };
                  }
                  
                  logger.info("Stream completed with [DONE] - raw fullResponse from AI service", { 
                    fullResponse,
                    length: fullResponse.length 
                  });
                  
                  const cleanedResponse = this.cleanResponse(fullResponse);
                  if (pendingUpdate) {
                    onChunk(cleanedResponse);
                  }
                  return { success: true, data: { type: "text", content: cleanedResponse } };
                }

                try {
                  const parsed = JSON.parse(data) as { 
                    content?: string; 
                    error?: string;
                    type?: "image";
                    prompt?: string;
                  };
                  
                  // Handle image response from backend
                  if (parsed.type === "image" && parsed.content) {
                    logger.info("Received image response", { 
                      url: parsed.content.substring(0, 100),
                      prompt: parsed.prompt 
                    });
                    imageResponse = { url: parsed.content, prompt: parsed.prompt };
                    if (onImage) {
                      onImage(parsed.content, parsed.prompt);
                    }
                  } else if (parsed.content) {
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
    
    // Pattern 1: Remove bracket-style metadata tags with replying-to attribute (new format)
    // Handles: [Q1 replying-to="A2"]content[/Q1], [A1]content[/A1], etc.
    const bracketWrapMatch = cleaned.match(/^\[(Q|A|DOC|CTX|[A-Z]+)\d+(?:\s+replying-to="[^"]*")?\]\s*([\s\S]*?)\s*\[\/\1\d+\]$/i);
    if (bracketWrapMatch) {
      const extracted = bracketWrapMatch[2].trim();
      if (extracted.length > 0) {
        logger.warn("Model leaked bracket metadata tags (full wrap) - cleaning response", {
          original: cleaned.substring(0, 200),
          cleaned: extracted.substring(0, 200)
        });
        cleaned = extracted;
      }
    }
    
    // Pattern 2: Remove any remaining bracket tags anywhere in response
    const beforeBracketClean = cleaned;
    cleaned = cleaned
      .replace(/\[(Q|A|DOC|CTX|[A-Z]+)\d+(?:\s+replying-to="[^"]*")?\]/gi, '') // Remove opening tags with optional replying-to
      .replace(/\[\/(Q|A|DOC|CTX|[A-Z]+)\d+\]/gi, ''); // Remove closing tags
    
    if (beforeBracketClean !== cleaned) {
      logger.warn("Model leaked partial bracket metadata tags - cleaning response", {
        original: beforeBracketClean.substring(0, 200),
        cleaned: cleaned.substring(0, 200)
      });
    }
    
    // Pattern 3: Remove old-style XML node tags (backward compatibility)
    // Handles: <node ...>content</node>
    const fullWrapMatch = cleaned.match(/^<node[^>]*>([\s\S]*?)<\/node>$/i);
    if (fullWrapMatch) {
      const extracted = fullWrapMatch[1].trim();
      if (extracted.length > 0) {
        logger.warn("Model leaked old-style node tags (full wrap) - cleaning response", {
          original: cleaned.substring(0, 200),
          cleaned: extracted.substring(0, 200)
        });
        cleaned = extracted;
      }
    }
    
    // Pattern 4: Remove any remaining old-style XML tags
    const beforeXmlClean = cleaned;
    cleaned = cleaned
      .replace(/<node[^>]*>/gi, '') // Remove all opening tags
      .replace(/<\/node>/gi, ''); // Remove all closing tags
    
    if (beforeXmlClean !== cleaned) {
      logger.warn("Model leaked partial old-style node tags - cleaning response", {
        original: beforeXmlClean.substring(0, 200),
        cleaned: cleaned.substring(0, 200)
      });
    }
    
    // Pattern 5: Remove separator tags
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

  static async fastChat(messages: ChatMessage[]) {
    const response = await fetch(`${globals.graphLLMBackendUrl}/api/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": getOrCreateClientId(),
      },
      body: JSON.stringify({
        messages,
        model: "openai/gpt-oss-120b",
        provider: {
          sort: "latency",
        },
      }),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      const error = new Error(
        `Server error (${response.status}): ${errorText || response.statusText}`
      );
      logger.error("Backend error in fastChat", { error });
      throw error;
    }
    
    const rawText = await response.text();
    logger.info("Raw response from AI service (fastChat)", { 
      rawText,
      length: rawText.length 
    });
    return this.cleanResponse(rawText);
  }
}
