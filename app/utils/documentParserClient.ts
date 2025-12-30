import { parseDocument, type ParseResult, type ParseError } from "./documentParser";
import { globals } from "../globals";

export interface DocumentParseResult {
  text: string;
  filename: string;
  error?: string;
}

// Server endpoint for document parsing fallback
const SERVER_PARSE_ENDPOINT = `${globals.graphLLMBackendUrl}/api/v1/document/parse`;

// Parse document with server fallback
async function parseDocumentOnServer(
  file: File
): Promise<DocumentParseResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(SERVER_PARSE_ENDPOINT, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Server parsing failed: ${response.statusText}`
    );
  }

  const data = await response.json();
  return {
    text: data.text || "",
    filename: file.name,
  };
}

// Main function: tries client parsing first, falls back to server
export async function parseDocumentWithFallback(
  file: File
): Promise<DocumentParseResult> {
  // First, try client-side parsing
  const clientResult = await parseDocument(file);

  // Check if client parsing succeeded
  if ("text" in clientResult && clientResult.text) {
    // Format the value to include filename for DocumentNode display
    const formattedValue = `FILENAME:${clientResult.metadata.filename}\n\n${clientResult.text}`;
    return {
      text: formattedValue,
      filename: clientResult.metadata.filename,
    };
  }

  // Client parsing failed or not supported, try server
  if ("error" in clientResult) {
    console.warn(
      `Client parsing failed for ${file.name}: ${clientResult.error}. Trying server fallback...`
    );
  }

  try {
    const serverResult = await parseDocumentOnServer(file);
    // Format with filename prefix for DocumentNode
    const formattedValue = `FILENAME:${serverResult.filename}\n\n${serverResult.text}`;
    return {
      text: formattedValue,
      filename: serverResult.filename,
    };
  } catch (serverError) {
    const errorMessage =
      serverError instanceof Error
        ? serverError.message
        : "Unknown server error";
    return {
      text: "",
      filename: file.name,
      error: `Failed to parse document: ${errorMessage}`,
    };
  }
}
