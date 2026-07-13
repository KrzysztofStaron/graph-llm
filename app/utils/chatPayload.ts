import type { ChatMessage } from "../interfaces/aiService";
import {
  MAX_INLINE_IMAGE_DATA_URL_SIZE,
  compressDataUrlIfNeeded,
} from "./imageCompression";

export const MAX_CHAT_REQUEST_BYTES = 450 * 1024;

const OMITTED_CONTENT_MARKER =
  "\n\n[... older content omitted to keep the request within the size limit ...]\n\n";
const OMITTED_IMAGE_MARKER =
  "[An inline image was omitted to keep the request within the size limit.]";
const MODEL_ALIASES: Record<string, string> = {
  "x-ai/grok-4.1-fast": "x-ai/grok-4.3",
};

type RequestOptions = {
  model?: string;
  imageModel?: string;
  provider?: {
    sort?: "latency" | "price" | "throughput";
    allow_fallbacks?: boolean;
  };
  webSearchEnabled?: boolean;
};

export type PreparedChatRequest = {
  messages: ChatMessage[];
  payload: string;
  stats: {
    originalBytes: number;
    finalBytes: number;
    compressedImages: number;
    omittedMessages: number;
    omittedImages: number;
    truncatedTextParts: number;
  };
};

const utf8Size = (value: string): number => {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).byteLength;
  }

  return value.length;
};

const cloneMessages = (messages: ChatMessage[]): ChatMessage[] =>
  messages.map((message) => ({
    ...message,
    content: Array.isArray(message.content)
      ? message.content.map((part) =>
          part.type === "image_url"
            ? { ...part, image_url: { ...part.image_url } }
            : { ...part }
        )
      : message.content,
  }));

const serializeRequest = (
  messages: ChatMessage[],
  options?: RequestOptions
): string => {
  const model = options?.model
    ? MODEL_ALIASES[options.model] ?? options.model
    : undefined;

  return JSON.stringify({
    messages,
    ...(model && { model }),
    ...(options?.imageModel && { imageModel: options.imageModel }),
    ...(options?.provider && { provider: options.provider }),
    ...(options?.webSearchEnabled && {
      plugins: [{ id: "web", engine: "native" }],
    }),
  });
};

const truncateMiddle = (value: string, targetLength: number): string => {
  if (value.length <= targetLength) return value;

  const availableLength = Math.max(
    0,
    targetLength - OMITTED_CONTENT_MARKER.length
  );
  const headLength = Math.ceil(availableLength / 2);
  const tailLength = Math.floor(availableLength / 2);

  return `${value.slice(0, headLength)}${OMITTED_CONTENT_MARKER}${
    tailLength > 0 ? value.slice(-tailLength) : ""
  }`;
};

/**
 * Compresses inline images and bounds the serialized request before it reaches
 * fetch. The newest user/assistant message and system instructions are kept;
 * older history is discarded first when the request exceeds the budget.
 */
export async function prepareChatRequest(
  message: string | ChatMessage[],
  options?: RequestOptions
): Promise<PreparedChatRequest> {
  const sourceMessages: ChatMessage[] = Array.isArray(message)
    ? message
    : [{ role: "user", content: message }];
  const messages = cloneMessages(sourceMessages);
  const originalBytes = utf8Size(serializeRequest(messages, options));

  let compressedImages = 0;
  let omittedMessages = 0;
  let omittedImages = 0;
  let truncatedTextParts = 0;

  // Existing saved graphs can contain images created before the current upload
  // limit, so enforce the image budget again immediately before sending.
  if (typeof Image !== "undefined") {
    for (const chatMessage of messages) {
      if (!Array.isArray(chatMessage.content)) continue;

      for (const part of chatMessage.content) {
        if (
          part.type !== "image_url" ||
          !part.image_url.url.startsWith("data:") ||
          part.image_url.url.length <= MAX_INLINE_IMAGE_DATA_URL_SIZE
        ) {
          continue;
        }

        try {
          const compressed = await compressDataUrlIfNeeded(
            part.image_url.url,
            MAX_INLINE_IMAGE_DATA_URL_SIZE
          );
          if (compressed.length < part.image_url.url.length) {
            part.image_url.url = compressed;
            compressedImages++;
          }
        } catch {
          // Compaction below will omit the image if it still exceeds the total
          // request budget.
        }
      }
    }
  }

  let payload = serializeRequest(messages, options);
  let payloadBytes = utf8Size(payload);

  const newestNonSystemIndex = (): number => {
    for (let index = messages.length - 1; index >= 0; index--) {
      if (messages[index].role !== "system") return index;
    }
    return -1;
  };

  // Remove oldest history first, while preserving all system messages and the
  // newest conversational message.
  while (payloadBytes > MAX_CHAT_REQUEST_BYTES) {
    const newestIndex = newestNonSystemIndex();
    const removableIndex = messages.findIndex(
      (chatMessage, index) =>
        chatMessage.role !== "system" && index !== newestIndex
    );

    if (removableIndex === -1) break;
    messages.splice(removableIndex, 1);
    omittedMessages++;

    // Avoid leaving an orphaned assistant response at the beginning of the
    // compacted conversation after its matching user message was removed.
    const firstNonSystemIndex = messages.findIndex(
      (chatMessage) => chatMessage.role !== "system"
    );
    if (
      firstNonSystemIndex !== -1 &&
      firstNonSystemIndex !== newestNonSystemIndex() &&
      messages[firstNonSystemIndex].role === "assistant"
    ) {
      messages.splice(firstNonSystemIndex, 1);
      omittedMessages++;
    }

    payload = serializeRequest(messages, options);
    payloadBytes = utf8Size(payload);
  }

  // If the newest message alone contains too many inline images, retain the
  // most recent images by removing data URLs from left to right.
  while (payloadBytes > MAX_CHAT_REQUEST_BYTES) {
    let removedImage = false;

    for (const chatMessage of messages) {
      if (!Array.isArray(chatMessage.content)) continue;

      const imageIndex = chatMessage.content.findIndex(
        (part) =>
          part.type === "image_url" && part.image_url.url.startsWith("data:")
      );
      if (imageIndex === -1) continue;

      chatMessage.content.splice(imageIndex, 1);
      if (chatMessage.content.length === 0) {
        chatMessage.content.push({ type: "text", text: OMITTED_IMAGE_MARKER });
      } else if (
        !chatMessage.content.some(
          (part) => part.type === "text" && part.text === OMITTED_IMAGE_MARKER
        )
      ) {
        chatMessage.content.unshift({
          type: "text",
          text: OMITTED_IMAGE_MARKER,
        });
      }
      omittedImages++;
      removedImage = true;
      break;
    }

    if (!removedImage) break;
    payload = serializeRequest(messages, options);
    payloadBytes = utf8Size(payload);
  }

  // A single current document or prompt can still exceed the cap. Preserve its
  // beginning and end, reducing the largest text field on each pass.
  while (payloadBytes > MAX_CHAT_REQUEST_BYTES) {
    const textFields: Array<{
      value: string;
      minimumLength: number;
      update: (value: string) => void;
    }> = [];

    messages.forEach((chatMessage) => {
      const minimumLength = chatMessage.role === "system" ? 2048 : 512;
      if (typeof chatMessage.content === "string") {
        textFields.push({
          value: chatMessage.content,
          minimumLength,
          update: (value) => {
            chatMessage.content = value;
          },
        });
        return;
      }

      chatMessage.content.forEach((part) => {
        if (part.type !== "text") return;
        textFields.push({
          value: part.text,
          minimumLength,
          update: (value) => {
            part.text = value;
          },
        });
      });
    });

    const largestField = textFields
      .filter((field) => field.value.length > field.minimumLength)
      .sort((a, b) => b.value.length - a.value.length)[0];
    if (!largestField) break;

    const excessBytes = payloadBytes - MAX_CHAT_REQUEST_BYTES;
    const targetLength = Math.max(
      largestField.minimumLength,
      largestField.value.length - excessBytes - 2048
    );
    largestField.update(truncateMiddle(largestField.value, targetLength));
    truncatedTextParts++;
    payload = serializeRequest(messages, options);
    payloadBytes = utf8Size(payload);
  }

  if (payloadBytes > MAX_CHAT_REQUEST_BYTES) {
    throw new Error(
      `The chat request could not be reduced below ${Math.round(
        MAX_CHAT_REQUEST_BYTES / 1024
      )}KB. Remove some connected context and try again.`
    );
  }

  return {
    messages,
    payload,
    stats: {
      originalBytes,
      finalBytes: payloadBytes,
      compressedImages,
      omittedMessages,
      omittedImages,
      truncatedTextParts,
    },
  };
}
