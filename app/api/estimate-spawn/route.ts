import { NextResponse } from "next/server";
import { experimental_evaluate as evaluate } from "ai";
import { loadAiGatewayKey } from "../../utils/loadAiGatewayKey";
import {
  parseSpawnChoice,
  SPAWN_TYPES,
  type SpawnType,
} from "../../utils/parseSpawnChoice";

export const maxDuration = 30;

const JEV_MODEL = "typesafe-ai/jev";

type EstimateBody = {
  prompt: string;
  contextPreview?: string;
};

const parseBody = (value: unknown): EstimateBody | { error: string } => {
  if (typeof value !== "object" || value === null) {
    return { error: "Invalid JSON body" };
  }

  const record = value as Record<string, unknown>;
  if (typeof record.prompt !== "string" || record.prompt.trim().length === 0) {
    return { error: "prompt is required" };
  }

  const contextPreview =
    typeof record.contextPreview === "string"
      ? record.contextPreview.slice(0, 500)
      : undefined;

  return { prompt: record.prompt.trim(), contextPreview };
};

const CRITERIA: Record<SpawnType, string> = {
  text: "The user wants a written markdown answer, explanation, code, or analysis. No picture generation and no video lookup.",
  image:
    "The user wants a new picture generated (draw, illustrate, generate an image, visualize as art). Not an uploaded image and not a video.",
  youtube:
    "The user wants one or more YouTube videos found or embedded (watch, show a video, find a tutorial on YouTube).",
};

export async function POST(request: Request) {
  const key = loadAiGatewayKey();
  if (!key.ok) {
    return NextResponse.json({ error: key.error }, { status: 500 });
  }

  const parsed = parseBody(await request.json());
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const stateParts = [`User prompt: ${parsed.prompt}`];
  if (parsed.contextPreview) {
    stateParts.push(`Nearby context: ${parsed.contextPreview}`);
  }
  stateParts.push(
    "Pick which canvas card this prompt should spawn first: a text reply, a generated image, or a YouTube video lookup."
  );

  const result = await evaluate({
    model: JEV_MODEL,
    state: stateParts.join("\n\n"),
    questions: {
      spawn: {
        type: "choice" as const,
        instructions:
          "Classify the user prompt for a graph canvas. Choose exactly one: text (markdown answer), image (generate a picture), or youtube (look up or embed video).",
        criteria: CRITERIA,
      },
    },
  });

  const parsedChoice = parseSpawnChoice(result.answers.spawn);
  if (!parsedChoice.ok) {
    return NextResponse.json({ error: parsedChoice.error }, { status: 502 });
  }

  return NextResponse.json({
    type: parsedChoice.type,
    probabilities: parsedChoice.probabilities,
    keys: SPAWN_TYPES,
  });
}
