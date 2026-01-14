"use server";

const lokiHost = process.env.GRAPHANA_URL || process.env.LOKI_HOST;
const graphanaUser = process.env.GRAPHANA_USER;
const graphanaToken = process.env.GRAPHANA_TOKEN;
const lokiBasicAuth =
  process.env.LOKI_BASIC_AUTH ||
  (graphanaUser && graphanaToken ? `${graphanaUser}:${graphanaToken}` : undefined);

interface LogEntry {
  message: unknown;
  level: string;
  timestamp?: string;
  traceId?: string;
  [key: string]: unknown;
}

export async function sendToLoki(info: LogEntry): Promise<void> {
  if (!lokiHost || !lokiBasicAuth) return;

  const timestamp = info.timestamp || new Date().toISOString();
  const timestampNs = `${Date.parse(timestamp)}000000`;
  const message = JSON.stringify(info);

  const streamLabels: Record<string, string> = {
    app: 'graph-llm-frontend',
    env: process.env.NODE_ENV || 'development',
    service: 'graph-llm-frontend',
  };

  if (info.traceId) {
    streamLabels.traceId = info.traceId;
  }

  const streams = [
    {
      stream: streamLabels,
      values: [[timestampNs, message]],
    },
  ];

  await fetch(`${lokiHost}/loki/api/v1/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(lokiBasicAuth).toString('base64')}`,
    },
    body: JSON.stringify({ streams }),
  });
}