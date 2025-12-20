"use server";

import { OpenRouter } from "@openrouter/sdk";

export async function* streamLLM(query: string) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const openRouter = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const stream = await openRouter.chat.send({
    model: "openai/gpt-oss-120b",
    stream: true,
    provider: {
      sort: "latency",
    },
    messages: [
      {
        role: "user",
        content: query,
      },
    ],
  });

  let content = "";
  for await (const chunk of stream) {
    console.log(chunk.choices[0].delta);
    content += chunk.choices[0].delta.content || "";
  }

  return content;
}
