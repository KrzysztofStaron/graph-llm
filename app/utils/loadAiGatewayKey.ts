import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type AiGatewayKeyResult =
  | { ok: true; apiKey: string }
  | { ok: false; error: string };

/**
 * Resolve AI_GATEWAY_API_KEY from process.env, then (in development only)
 * from ~/.vercel-ai-gateway.env.
 */
export function loadAiGatewayKey(
  env: NodeJS.ProcessEnv = process.env
): AiGatewayKeyResult {
  const fromEnv = (env.AI_GATEWAY_API_KEY ?? "").trim();
  if (fromEnv) {
    if (!process.env.AI_GATEWAY_API_KEY) {
      process.env.AI_GATEWAY_API_KEY = fromEnv;
    }
    return { ok: true, apiKey: fromEnv };
  }

  if (env.NODE_ENV === "production") {
    return { ok: false, error: "AI_GATEWAY_API_KEY is not set" };
  }

  const envPath = join(homedir(), ".vercel-ai-gateway.env");
  if (!existsSync(envPath)) {
    return { ok: false, error: "AI_GATEWAY_API_KEY is not set" };
  }

  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^AI_GATEWAY_API_KEY=(.*)$/);
    if (!match) continue;
    const apiKey = match[1]!.trim().replace(/^["']|["']$/g, "");
    if (!apiKey) continue;
    process.env.AI_GATEWAY_API_KEY = apiKey;
    return { ok: true, apiKey };
  }

  return { ok: false, error: "AI_GATEWAY_API_KEY is not set" };
}
