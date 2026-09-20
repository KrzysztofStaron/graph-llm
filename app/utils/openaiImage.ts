export const OPENAI_IMAGE_MODELS = ["gpt-image-1", "gpt-image-1-mini"] as const;

export type OpenAIImageModel = (typeof OPENAI_IMAGE_MODELS)[number];

export type ImageGenerationResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export const isOpenAIImageModel = (model: string | undefined): boolean =>
  model === "gpt-image-1" || model === "gpt-image-1-mini";

export const collectImageUrls = (
  messages: Array<{
    content:
      | string
      | Array<
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string } }
        >;
  }>
): string[] => {
  const urls: string[] = [];

  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type === "image_url" && part.image_url.url) {
        urls.push(part.image_url.url);
      }
    }
  }

  return urls.slice(-4);
};

const parseGenerateImageResponse = (data: unknown): ImageGenerationResult => {
  if (typeof data !== "object" || data === null) {
    return { ok: false, error: "Invalid generate-image response" };
  }

  const record = data as Record<string, unknown>;
  if (typeof record.url === "string" && record.url.length > 0) {
    return { ok: true, url: record.url };
  }
  if (typeof record.error === "string" && record.error.length > 0) {
    return { ok: false, error: record.error };
  }

  return { ok: false, error: "Generate-image response missing url" };
};

export async function generateImageOnClient(params: {
  prompt: string;
  model?: string;
  images: string[];
}): Promise<ImageGenerationResult> {
  const response = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const data: unknown = await response.json();
  const parsed = parseGenerateImageResponse(data);
  if (parsed.ok) return parsed;
  if (!response.ok) {
    return {
      ok: false,
      error: parsed.error || `OpenAI image generation failed (${response.status})`,
    };
  }
  return parsed;
}
