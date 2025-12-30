export interface ParseResult {
  text: string;
  metadata: {
    filename: string;
    fileType: string;
    mimeType: string;
  };
}

export interface ParseError {
  error: string;
  details?: string;
}

// Normalize text - remove excessive whitespace, normalize newlines
function normalizeText(text: string): string {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

// Parse PDF using pdfjs-dist
async function parsePdf(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");

  // Set worker source - use unpkg CDN which works better with CORS
  const pdfjsVersion = pdfjsLib.version || "4.10.38";
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => {
        if ("str" in item && item.str) {
          return item.str;
        }
        return "";
      })
      .join(" ");
    fullText += pageText + "\n\n";
  }

  return normalizeText(fullText);
}

// Parse DOCX using mammoth
async function parseDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");

  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });

  return normalizeText(result.value);
}

// Parse XLSX using xlsx
async function parseXlsx(file: File): Promise<string> {
  const XLSX = await import("xlsx");

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  let fullText = "";

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    fullText += `Sheet: ${sheetName}\n`;

    // Convert to CSV format (works well for LLM ingestion)
    const csv = XLSX.utils.sheet_to_csv(sheet);
    fullText += csv + "\n\n";
  }

  return normalizeText(fullText);
}

// Parse PPTX - use officeparser if available, otherwise fallback
async function parsePptx(_file: File): Promise<string> {
  // PPTX parsing in browser is complex, we'll primarily rely on server fallback
  // But we can try a basic approach if needed
  throw new Error("PPTX parsing not supported in browser, use server fallback");
}

// Parse HTML using native DOMParser
async function parseHtml(file: File): Promise<string> {
  const html = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Remove script and style elements
  const scripts = doc.querySelectorAll("script, style, nav, footer, header");
  scripts.forEach((el) => el.remove());

  // Extract text from body
  const body = doc.body;
  if (!body) {
    return normalizeText(doc.documentElement.textContent || "");
  }

  return normalizeText(body.textContent || "");
}

// Parse plain text
async function parseText(file: File): Promise<string> {
  const text = await file.text();
  return normalizeText(text);
}

// Detect file type from MIME type or extension
function detectFileType(file: File): {
  type: string;
  canParseInBrowser: boolean;
} {
  const mimeType = file.type.toLowerCase();
  const filename = file.name.toLowerCase();

  // Check MIME types first
  if (mimeType === "application/pdf" || filename.endsWith(".pdf")) {
    return { type: "pdf", canParseInBrowser: true };
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.endsWith(".docx")
  ) {
    return { type: "docx", canParseInBrowser: true };
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    filename.endsWith(".xlsx")
  ) {
    return { type: "xlsx", canParseInBrowser: true };
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    filename.endsWith(".pptx")
  ) {
    return { type: "pptx", canParseInBrowser: false };
  }

  if (
    mimeType === "text/html" ||
    filename.endsWith(".html") ||
    filename.endsWith(".htm")
  ) {
    return { type: "html", canParseInBrowser: true };
  }

  if (
    mimeType.startsWith("text/") ||
    filename.endsWith(".txt") ||
    filename.endsWith(".md") ||
    filename.endsWith(".json") ||
    filename.endsWith(".csv")
  ) {
    return { type: "text", canParseInBrowser: true };
  }

  // Default to unknown
  return { type: "unknown", canParseInBrowser: false };
}

// Main parser function
export async function parseDocument(
  file: File
): Promise<ParseResult | ParseError> {
  try {
    const { type, canParseInBrowser } = detectFileType(file);

    if (!canParseInBrowser) {
      return {
        error: "File type not supported in browser",
        details: `Type: ${type}, MIME: ${file.type}`,
      };
    }

    let text: string;

    switch (type) {
      case "pdf":
        text = await parsePdf(file);
        break;
      case "docx":
        text = await parseDocx(file);
        break;
      case "xlsx":
        text = await parseXlsx(file);
        break;
      case "pptx":
        text = await parsePptx(file);
        break;
      case "html":
        text = await parseHtml(file);
        break;
      case "text":
        text = await parseText(file);
        break;
      default:
        return {
          error: "Unsupported file type",
          details: `Type: ${type}, MIME: ${file.type}`,
        };
    }

    return {
      text,
      metadata: {
        filename: file.name,
        fileType: type,
        mimeType: file.type,
      },
    };
  } catch (error) {
    return {
      error: "Failed to parse document",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}
