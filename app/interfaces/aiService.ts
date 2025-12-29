import { globals } from "../globals";

// Content types for multi-modal messages
type TextContentPart = { type: "text"; text: string };
type ImageContentPart = {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
};
type ContentPart = TextContentPart | ImageContentPart;

type ChatMessage = {
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
    const response = await fetch(`${globals.graphLLMBackendUrl}/api/v1/chat`, {
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Backend error:", errorText);
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${errorText}`
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
    }
  ): Promise<string> {
    const response = await fetch(
      `${globals.graphLLMBackendUrl}/api/v1/chat/stream`,
      {
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
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Backend error:", errorText);
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${errorText}`
      );
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }

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
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

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
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (pendingUpdate) {
      onChunk(fullResponse);
    }

    return fullResponse;
  }
}
