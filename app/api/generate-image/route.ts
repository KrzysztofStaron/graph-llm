import { NextResponse } from "next/server";
import { isOpenAIImageModel } from "../../utils/openaiImage";

export const maxDuration = 120;

type GenerateImageBody = {
  prompt: string;
  model: string;
  images: string[];
};

const parseBody = (value: unknown): GenerateImageBody | { error: string } => {
  if (typeof value !== "object" || value === null) {
    return { error: "Invalid JSON body" };
  }

  const record = value as Record<string, unknown>;
  if (typeof record.prompt !== "string" || record.prompt.trim().length === 0) {
    return { error: "prompt is required" };
  }

  const images = Array.isArray(record.images)
    ? record.images.filter((image): image is string => typeof image === "string")
    : [];

  const requestedModel =
    typeof record.model === "string" ? record.model : "gpt-image-1";
  const model = isOpenAIImageModel(requestedModel)
    ? requestedModel
    : "gpt-image-1";

  return { prompt: record.prompt, model, images };
};

const imageUrlFromOpenAI = (data: unknown): { url: string } | { error: string } => {
  if (typeof data !== "object" || data === null) {
    return { error: "Empty OpenAI response" };
  }

  const record = data as Record<string, unknown>;
  if (typeof record.error === "object" && record.error !== null) {
    const errorRecord = record.error as Record<string, unknown>;
    if (typeof errorRecord.message === "string") {
      return { error: errorRecord.message };
    }
  }

  if (!Array.isArray(record.data) || record.data.length === 0) {
    return { error: "OpenAI response had no image data" };
  }

  const first = record.data[0];
  if (typeof first !== "object" || first === null) {
    return { error: "OpenAI image entry was not an object" };
  }

  const image = first as Record<string, unknown>;
  if (typeof image.b64_json === "string" && image.b64_json.length > 0) {
    return { url: `data:image/png;base64,${image.b64_json}` };
  }
  if (typeof image.url === "string" && image.url.length > 0) {
    return { url: image.url };
  }

  return { error: "OpenAI image entry had no url or b64_json" };
};

const blobFromImageUrl = async (
  url: string,
  signal: AbortSignal
): Promise<{ ok: true; blob: Blob } | { ok: false; error: string }> => {
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    if (comma < 0) return { ok: false, error: "Malformed data URL" };
    const header = url.slice("data:".length, comma);
    const mime = header.split(";")[0] || "image/png";
    const buffer = Buffer.from(url.slice(comma + 1), "base64");
    return { ok: true, blob: new Blob([buffer], { type: mime }) };
  }

  const response = await fetch(url, { signal });
  if (!response.ok) {
    return {
      ok: false,
      error: `Failed to fetch reference image (${response.status})`,
    };
  }
  return { ok: true, blob: await response.blob() };
};

const requestOpenAIImage = async (
  body: GenerateImageBody,
  apiKey: string,
  signal: AbortSignal
) => {
  if (body.images.length === 0) {
    return fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: body.model,
        prompt: body.prompt,
        n: 1,
        size: "1024x1024",
      }),
      signal,
    });
  }

  const form = new FormData();
  form.append("model", body.model);
  form.append("prompt", body.prompt);
  form.append("n", "1");
  form.append("size", "1024x1024");

  let attached = 0;
  for (const [index, imageUrl] of body.images.entries()) {
    const image = await blobFromImageUrl(imageUrl, signal);
    if (!image.ok) continue;
    const extension = image.blob.type.includes("jpeg") ? "jpg" : "png";
    form.append("image[]", image.blob, `reference-${index}.${extension}`);
    attached += 1;
  }

  if (attached === 0) {
    return fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: body.model,
        prompt: body.prompt,
        n: 1,
        size: "1024x1024",
      }),
      signal,
    });
  }

  return fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
    signal,
  });
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set" },
      { status: 500 }
    );
  }

  const parsed = parseBody(await request.json());
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const openaiResponse = await requestOpenAIImage(parsed, apiKey, request.signal);
  const openaiBody: unknown = await openaiResponse.json();
  const image = imageUrlFromOpenAI(openaiBody);

  if ("error" in image) {
    return NextResponse.json(
      { error: image.error },
      { status: openaiResponse.ok ? 502 : openaiResponse.status }
    );
  }

  return NextResponse.json({ url: image.url, model: parsed.model });
}
