import { globals } from "../globals";

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
        throw new Error(
          `Network error: Cannot reach ${globals.graphLLMBackendUrl}. Check your connection or server status.`
        );
      }
      // Re-throw other errors as-is
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("Backend error:", errorText);
      throw new Error(
        `Server error (${response.status}): ${errorText || response.statusText}`
      );
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
          },
          body: payload,
          signal: timeoutController.signal,
        }
      );
    } catch (fetchError) {
      // Handle specific error types
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        throw new Error(`Request timeout after ${TIMEOUT_MS / 1000} seconds`);
      }
      if (fetchError instanceof TypeError) {
        // TypeError typically indicates network failure, CORS, or DNS issues
        throw new Error(
          `Network error: Cannot reach ${globals.graphLLMBackendUrl}. Check your connection or server status.`
        );
      }
      // Re-throw other errors as-is
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("Backend error:", errorText);
      throw new Error(
        `Server error (${response.status}): ${errorText || response.statusText}`
      );
    }

    if (!response.body) {
      throw new Error("Response body is null");
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
            throw new Error("Stream timeout: No data received for 30 seconds");
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
            throw new Error("Stream ended without any content");
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
                  onChunk(fullResponse);
                }
                return fullResponse;
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullResponse += parsed.content;
                  throttledOnChunk(fullResponse);
                }
                if (parsed.error) {
                  throw new Error(parsed.error);
                }
              } catch {
                // Skip invalid JSON but log it for debugging
                console.warn("Failed to parse SSE data:", data);
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
}
