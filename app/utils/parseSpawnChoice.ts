export const SPAWN_TYPES = ["text", "image", "youtube"] as const;

export type SpawnType = (typeof SPAWN_TYPES)[number];

export type ParseSpawnChoiceResult =
  | { ok: true; type: SpawnType; probabilities: Record<SpawnType, number> }
  | { ok: false; error: string };

export function isSpawnType(value: string): value is SpawnType {
  return (SPAWN_TYPES as readonly string[]).includes(value);
}

export function parseSpawnChoice(answer: unknown): ParseSpawnChoiceResult {
  if (typeof answer !== "object" || answer === null) {
    return { ok: false, error: "choice answer is not an object" };
  }

  const rec = answer as Record<string, unknown>;
  if (rec.type !== "choice") {
    return { ok: false, error: "choice answer type is not choice" };
  }

  const raw = rec.probabilities;
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "choice probabilities missing" };
  }

  const probs = raw as Record<string, unknown>;
  const probabilities = {} as Record<SpawnType, number>;
  let sum = 0;
  let bestId: SpawnType = "text";
  let bestP = -1;

  for (const key of SPAWN_TYPES) {
    const value = probs[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return { ok: false, error: `missing probability for ${key}` };
    }
    probabilities[key] = value;
    sum += value;
    if (value > bestP) {
      bestId = key;
      bestP = value;
    }
  }

  if (sum === 0) {
    return { ok: false, error: "choice probabilities are all zero" };
  }

  const chosen = rec.choice;
  if (typeof chosen === "string" && isSpawnType(chosen)) {
    return { ok: true, type: chosen, probabilities };
  }

  return { ok: true, type: bestId, probabilities };
}

export function spawnNodeType(
  spawn: SpawnType
): "response" | "image-response" {
  return spawn === "image" ? "image-response" : "response";
}
