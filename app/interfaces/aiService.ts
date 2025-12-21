import { globals } from "../globals";

export class aiService {
  static async chat(message: string | { role: string; content: string }[]): Promise<string> {
    const response = await fetch(`${globals.graphLLMBackendUrl}/api/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: Array.isArray(message) ? message : [{ role: "user", content: message }] }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.text();
  }

  static async streamChat(
    message: string | { role: string; content: string }[],
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const response = await fetch(`${globals.graphLLMBackendUrl}/api/v1/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: Array.isArray(message) ? message : [{ role: "user", content: message }] }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
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
    const THROTTLE_MS = 200;

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
