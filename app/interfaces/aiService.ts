import { globals } from "../globals";
import { getOrCreateClientId } from "../utils/clientId";
import logger from "../utils/logger";
import { getRequestHeaders } from "../utils/requestHeaders";

// Content types for multi-modal messages
type TextContentPart = { type: "text"; text: string };
type ImageContentPart = {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
};
type ContentPart = TextContentPart | ImageContentPart;

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
};

// Response types for streaming
export type StreamResponse = 
  | { type: "text"; content: string }
  | { type: "image"; content: string; prompt?: string };

export class aiService {
  static async chat(
    message: string | ChatMessage[],
    options?: {
      model?: string;
      imageModel?: string;
      provider?: {
        sort?: "latency" | "price" | "throughput";
        allow_fallbacks?: boolean;
      };
      webSearchEnabled?: boolean;
    }
  ): Promise<string> {
    const logData: {
      url?: string;
      model?: string;
      messageCount?: number;
      webSearchEnabled?: boolean;
      status?: number;
      statusText?: string;
      errorText?: string;
      rawTextLength?: number;
      error?: string;
    } = {
      url: `${globals.graphLLMBackendUrl}/api/v1/chat`,
      model: options?.model,
      messageCount: Array.isArray(message) ? message.length : 1,
      webSearchEnabled: options?.webSearchEnabled,
    };

    let response: Response;

    const requestBody = {
      messages: Array.isArray(message)
        ? message
        : [{ role: "user", content: message }],
      ...(options?.model && { model: options.model }),
      ...(options?.imageModel && { imageModel: options.imageModel }),
      ...(options?.provider && { provider: options.provider }),
      ...(options?.webSearchEnabled && { 
        plugins: [
          {
            id: "web",
            engine: "native" 
          }
        ]
      }),
    };

    try {
      response = await fetch(`${globals.graphLLMBackendUrl}/api/v1/chat`, {
        method: "POST",
        headers: getRequestHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      // Differentiate between network errors and other issues
      if (error instanceof TypeError) {
        // TypeError typically indicates network failure, CORS, or DNS issues
        const networkError = new Error(
          `Network error: Cannot reach ${globals.graphLLMBackendUrl}. Check your connection or server status.`
        );
        logData.error = networkError.message;
        logger.error("Network error in chat", logData);
        throw networkError;
      }

      logData.error = error instanceof Error ? error.message : String(error);
      logger.error("Error in chat", logData);
      // Re-throw other errors as-is
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      const error = new Error(
        `Server error (${response.status}): ${errorText || response.statusText}`
      );
      logData.status = response.status;
      logData.statusText = response.statusText;
      logData.errorText = errorText;
      logData.error = error.message;
      logger.error("Backend error in chat", logData);
      throw error;
    }

    const rawText = await response.text();
    logData.rawTextLength = rawText.length;
    logger.info("Raw response from AI service (non-streaming)", logData);
    return this.cleanResponse(rawText);
  }

  static async streamChat(
    message: string | ChatMessage[],
    onChunk: (chunk: string) => void,
    options?: {
      model?: string;
      imageModel?: string;
      provider?: {
        sort?: "latency" | "price" | "throughput";
        allow_fallbacks?: boolean;
      };
      timeoutMs?: number;
      retries?: number;
      webSearchEnabled?: boolean;
    },
    onImage?: (imageUrl: string, prompt?: string) => void,
    onReasoning?: (reasoning: string) => void,
    onYoutube?: (videoId: string, explanation?: string) => void
  ): Promise<StreamResponse> {
    const maxRetries = options?.retries ?? 2;
    let lastError: Error | null = null;

    const logData: {
      supportsStreaming?: boolean;
      attempt?: number;
      maxRetries?: number;
      backoffMs?: number;
      lastError?: string;
      attempts?: number;
      error?: string;
    } = {
      supportsStreaming: typeof ReadableStream !== "undefined" &&
        typeof TextDecoder !== "undefined" &&
        typeof Response !== "undefined",
    };

    // Feature detection: check if streaming is supported
    const supportsStreaming = logData.supportsStreaming;

    // If streaming is not supported, fall back to non-streaming endpoint
    if (!supportsStreaming) {
      logger.warn(
        "Streaming not supported in this browser, falling back to non-streaming endpoint",
        logData
      );
      const result = await this.chat(message, options);
      onChunk(result);
      return { type: "text", content: result };
    }

    // Retry logic with exponential backoff
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        logData.attempt = attempt + 1;
        logData.maxRetries = maxRetries + 1;
        logData.backoffMs = backoffMs;
        logData.lastError = lastError?.message;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }

      const result = await this._attemptStreamChat(message, onChunk, options, onImage, onReasoning, onYoutube);
      if (result.success) {
        return result.data;
      }

      lastError = result.error;
      
      // Only retry on "Stream ended without any content" errors
      if (!result.error.message.includes("Stream ended without any content")) {
        logData.error = lastError.message;
        logger.error("StreamChat failed", logData);
        throw result.error;
      }
      
      if (attempt === maxRetries) {
        logData.attempts = maxRetries + 1;
        logData.lastError = lastError.message;
        logger.error("All retry attempts exhausted for streamChat", logData);
        throw lastError;
      }
    }

    throw lastError || new Error("Unknown error in streamChat");
  }

  private static async _attemptStreamChat(
    message: string | ChatMessage[],
    onChunk: (chunk: string) => void,
    options?: {
      model?: string;
      imageModel?: string;
      provider?: {
        sort?: "latency" | "price" | "throughput";
        allow_fallbacks?: boolean;
      };
      timeoutMs?: number;
      webSearchEnabled?: boolean;
    },
    onImage?: (imageUrl: string, prompt?: string) => void,
    onReasoning?: (reasoning: string) => void,
    onYoutube?: (videoId: string, explanation?: string) => void
  ): Promise<{ success: true; data: StreamResponse } | { success: false; error: Error }> {
    const logData: {
      url?: string;
      model?: string;
      messageCount?: number;
      webSearchEnabled?: boolean;
      timeoutMs?: number;
      status?: number;
      statusText?: string;
      errorText?: string;
      error?: string;
      errorName?: string;
      errorStack?: string;
      extractedStatus?: number;
      payloadSize?: number;
      payloadSizeKB?: number;
      payloadSizeMB?: string;
      payloadBreakdown?: {
        textKB?: number;
        imageUrlsKB?: number;
        dataUrlsKB?: number;
        dataUrlCount?: number;
        imageCount?: number;
        messageCount?: number;
      };
      readError?: string;
      fallbackToNonStreaming?: boolean;
      rawResultLength?: number;
      inactivityTimeoutMs?: number;
      fullResponseLength?: number;
      messagePreview?: unknown;
      buffer?: string;
      imageReceived?: boolean;
      imageUrl?: string;
      imagePrompt?: string;
      youtubeReceived?: boolean;
      youtubeVideoId?: string;
      youtubeExplanation?: string;
      hasYoutubeCallback?: boolean;
      parsedError?: string;
      parseError?: string;
      data?: string;
    } = {
      url: `${globals.graphLLMBackendUrl}/api/v1/chat/stream`,
      model: options?.model,
      messageCount: Array.isArray(message) ? message.length : 1,
      webSearchEnabled: options?.webSearchEnabled,
    };

    try {
      const messagesArray = Array.isArray(message)
        ? message
        : [{ role: "user", content: message }];
      
      // Analyze payload composition
      const payloadAnalysis = {
        messageCount: messagesArray.length,
        imageCount: 0,
        textLength: 0,
        imageUrlLength: 0,
        dataUrlLength: 0,
        dataUrlCount: 0,
      };

      messagesArray.forEach((msg) => {
        if (Array.isArray(msg.content)) {
          msg.content.forEach((part) => {
            if (part.type === 'text') {
              payloadAnalysis.textLength += part.text?.length || 0;
            } else if (part.type === 'image_url') {
              payloadAnalysis.imageCount++;
              const url = part.image_url?.url || '';
              if (url.startsWith('data:')) {
                payloadAnalysis.dataUrlCount++;
                payloadAnalysis.dataUrlLength += url.length;
              } else {
                payloadAnalysis.imageUrlLength += url.length;
              }
            }
          });
        } else if (typeof msg.content === 'string') {
          payloadAnalysis.textLength += msg.content.length;
        }
      });

      const payload = JSON.stringify({
        messages: messagesArray,
        ...(options?.model && { model: options.model }),
        ...(options?.imageModel && { imageModel: options.imageModel }),
        ...(options?.provider && { provider: options.provider }),
        ...(options?.webSearchEnabled && { 
          plugins: [
            {
              id: "web",
              engine: "native" 
            }
          ]
        }),
      });

      const payloadSize = payload.length;
      logData.payloadSize = payloadSize;
      logData.payloadSizeKB = Math.round(payloadSize / 1024);
      logData.payloadSizeMB = (payloadSize / (1024 * 1024)).toFixed(2);
      logData.payloadBreakdown = {
        textKB: Math.round(payloadAnalysis.textLength / 1024),
        imageUrlsKB: Math.round(payloadAnalysis.imageUrlLength / 1024),
        dataUrlsKB: Math.round(payloadAnalysis.dataUrlLength / 1024),
        dataUrlCount: payloadAnalysis.dataUrlCount,
        imageCount: payloadAnalysis.imageCount,
        messageCount: payloadAnalysis.messageCount,
      };

      // Determine logging level based on payload health
      const hasDataUrls = payloadAnalysis.dataUrlCount > 0;
      const payloadTooLarge = payloadSize > 500000; // 500KB threshold
      const logLevel = payloadTooLarge ? 'error' : hasDataUrls ? 'warn' : 'info';
      const logMessage = payloadTooLarge 
        ? `CRITICAL: Payload exceeds safe size (${logData.payloadSizeMB}MB / 500KB limit)`
        : hasDataUrls
        ? `Payload contains ${payloadAnalysis.dataUrlCount} base64 data URL(s) (${logData.payloadBreakdown.dataUrlsKB}KB)`
        : `Payload optimal (${logData.payloadSizeKB}KB, all hosted URLs)`;

      const fullMessage = `[PAYLOAD_ANALYSIS] [${logLevel.toUpperCase()}] ${logMessage}`;

      // Single comprehensive log call
      if (logLevel === 'error') {
        logger.error(fullMessage, logData);
      } else if (logLevel === 'warn') {
        logger.warn(fullMessage, logData);
      } else {
        logger.info(fullMessage, logData);
      }

      const TIMEOUT_MS = options?.timeoutMs || 120000; // 2 minutes default timeout
      logData.timeoutMs = TIMEOUT_MS;
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUT_MS);

      let response: Response;

      try {
        response = await fetch(
          `${globals.graphLLMBackendUrl}/api/v1/chat/stream`,
          {
            method: "POST",
            headers: getRequestHeaders({
              "Content-Type": "application/json",
            }),
            body: payload,
            signal: timeoutController.signal,
          }
        );
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        // Extract all available error information
        const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
        const errorName = fetchError instanceof Error ? fetchError.name : 'Unknown';
        const errorStack = fetchError instanceof Error ? fetchError.stack : undefined;
        
        // Try to extract status code from error message (browser sometimes includes it in CORS errors)
        const statusMatch = errorMessage.match(/status code:?\s*(\d+)/i) || 
                           errorMessage.match(/Status code:?\s*(\d+)/i) ||
                           errorMessage.match(/\((\d+)\)/);
        const extractedStatus = statusMatch ? parseInt(statusMatch[1], 10) : undefined;
        
        // Calculate payload size for debugging
        const payloadSize = payload.length;
        const payloadSizeKB = Math.round(payloadSize / 1024);
        const payloadSizeMB = (payloadSize / (1024 * 1024)).toFixed(2);
        
        logData.error = errorMessage;
        logData.errorName = errorName;
        logData.errorStack = errorStack;
        logData.extractedStatus = extractedStatus;
        logData.payloadSize = payloadSize;
        logData.payloadSizeKB = payloadSizeKB;
        logData.payloadSizeMB = payloadSizeMB;
        
        // Handle specific error types
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          const timeoutError = new Error(`Request timeout after ${TIMEOUT_MS / 1000} seconds`);
          logData.error = timeoutError.message;
          logger.error("Request timeout in streamChat", logData);
          return { success: false, error: timeoutError };
        }
        
        if (fetchError instanceof TypeError) {
          // Check if it's a CORS error with status code
          const isCorsError = errorMessage.toLowerCase().includes('cors') || 
                             errorMessage.toLowerCase().includes('access-control');
          
          let errorMsg: string;
          if (extractedStatus) {
            if (extractedStatus === 413) {
              errorMsg = `Payload too large (${extractedStatus}): Request size is ${payloadSizeMB}MB, which exceeds server limits. Payload: ${payloadSizeKB}KB`;
            } else {
              errorMsg = `CORS/Network error (${extractedStatus}): ${errorMessage}. Payload size: ${payloadSizeKB}KB`;
            }
          } else if (isCorsError) {
            errorMsg = `CORS error: ${errorMessage}. Payload size: ${payloadSizeKB}KB. This may indicate the request was blocked due to size limits or CORS policy.`;
          } else {
            errorMsg = `Network error: ${errorMessage}. Cannot reach ${globals.graphLLMBackendUrl}. Payload size: ${payloadSizeKB}KB`;
          }
          
          const networkError = new Error(errorMsg);
          logData.error = networkError.message;
          logger.error("Network error in streamChat", logData);
          return { success: false, error: networkError };
        }
        
        // Handle other errors with full details
        const fullError = new Error(
          `Fetch error (${errorName}): ${errorMessage}${extractedStatus ? ` [Status: ${extractedStatus}]` : ''}. Payload size: ${payloadSizeKB}KB`
        );
        logData.error = fullError.message;
        logger.error("Fetch error in streamChat", logData);
        return { success: false, error: fullError };
      }

      if (!response.ok) {
        clearTimeout(timeoutId);
        
        // Calculate payload size for debugging
        const payloadSize = payload.length;
        const payloadSizeKB = Math.round(payloadSize / 1024);
        const payloadSizeMB = (payloadSize / (1024 * 1024)).toFixed(2);
        
        // Try to read error response body
        let errorText = "Unknown error";
        try {
          errorText = await response.text();
        } catch (readError) {
          // If we can't read the body (e.g., CORS), try to get status text
          errorText = response.statusText || "Could not read error response";
          logData.readError = readError instanceof Error ? readError.message : String(readError);
        }
        
        // Build descriptive error message
        let errorMessage: string;
        if (response.status === 413) {
          errorMessage = `Payload too large (413): Request size is ${payloadSizeMB}MB (${payloadSizeKB}KB), which exceeds server limits. ${errorText !== "Unknown error" ? `Server message: ${errorText}` : ''}`;
        } else {
          errorMessage = `Server error (${response.status}): ${errorText || response.statusText}`;
        }
        
        const error = new Error(errorMessage);
        logData.status = response.status;
        logData.statusText = response.statusText;
        logData.errorText = errorText;
        logData.error = error.message;
        logData.payloadSize = payloadSize;
        logData.payloadSizeKB = payloadSizeKB;
        logData.payloadSizeMB = payloadSizeMB;
        logger.error("Backend error in streamChat", logData);
        return { success: false, error };
      }

      // Additional check: if response.body or getReader is not available, fall back
      if (!response.body || typeof response.body.getReader !== "function") {
        logData.fallbackToNonStreaming = true;
        clearTimeout(timeoutId);
        const rawResult = await response.text();
        logData.rawResultLength = rawResult.length;
        logger.info("Raw response from AI service (fallback non-streaming)", logData);
        const cleanedResult = this.cleanResponse(rawResult);
        onChunk(cleanedResult);
        return { success: true, data: { type: "text", content: cleanedResult } };
      }

      try {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = "";
        let fullResponse = "";
        let fullReasoning = "";
        let lastUpdateTime = 0;
        let lastReasoningUpdateTime = 0;
        let pendingUpdate = false;
        let pendingReasoningUpdate = false;
        let imageResponse: { url: string; prompt?: string } | null = null;
        const THROTTLE_MS = 300;

        const throttledOnChunk = (content: string) => {
          const now = Date.now();
          if (now - lastUpdateTime >= THROTTLE_MS) {
            onChunk(content);
            lastUpdateTime = now;
            pendingUpdate = false;
          } else {
            pendingUpdate = true;
          }
        };

        const throttledOnReasoning = (reasoning: string) => {
          if (!onReasoning) return;
          const now = Date.now();
          if (now - lastReasoningUpdateTime >= THROTTLE_MS) {
            onReasoning(reasoning);
            lastReasoningUpdateTime = now;
            pendingReasoningUpdate = false;
          } else {
            pendingReasoningUpdate = true;
          }
        };

        try {
          let lastChunkTime = Date.now();
          const INACTIVITY_TIMEOUT_MS = 60000; // 60 seconds of no data (increased for image generation)
          logData.inactivityTimeoutMs = INACTIVITY_TIMEOUT_MS;

          while (true) {
            // Check for inactivity timeout
            if (Date.now() - lastChunkTime > INACTIVITY_TIMEOUT_MS) {
              const timeoutError = new Error("Stream timeout: No data received for 60 seconds");
              logData.error = timeoutError.message;
              logger.error("Stream inactivity timeout", logData);
              return { success: false, error: timeoutError };
            }

            const { done, value } = await reader.read();

            if (done) {
              // If we got an image response, return it
              if (imageResponse) {
                logData.imageReceived = true;
                logData.imageUrl = imageResponse.url.substring(0, 100);
                logData.imagePrompt = imageResponse.prompt;
                logger.info("Stream completed with image", logData);
                return { 
                  success: true, 
                  data: { type: "image", content: imageResponse.url, prompt: imageResponse.prompt } 
                };
              }
              
              logData.fullResponseLength = fullResponse.length;
              
              // Stream ended without [DONE] signal - clean and return
              if (fullResponse.length === 0) {
                const streamError = new Error(
                  "Stream ended without any content. This may happen if the LLM provider rejected the request or returned an empty response. Retrying..."
                );
                logData.error = streamError.message;
                logData.messagePreview = Array.isArray(message) 
                  ? message.map(m => ({
                      role: m.role,
                      contentPreview: typeof m.content === 'string' 
                        ? m.content.substring(0, 300) 
                        : '[multipart]'
                    }))
                  : typeof message === 'string' ? message.substring(0, 300) : '[unknown]';
                logData.buffer = buffer.substring(0, 500);
                logger.error("Stream ended without content (empty fullResponse)", logData);
                return { success: false, error: streamError };
              }
              
              const cleanedResponse = this.cleanResponse(fullResponse);
              if (pendingUpdate) {
                onChunk(cleanedResponse);
              }
              if (pendingReasoningUpdate && onReasoning) {
                onReasoning(fullReasoning);
              }
              logger.info("Stream ended - raw fullResponse from AI service", logData);
              return { success: true, data: { type: "text", content: cleanedResponse } };
            }

            lastChunkTime = Date.now();
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") {
                  // If we got an image response, return it
                  if (imageResponse) {
                    logData.imageReceived = true;
                    logData.imageUrl = imageResponse.url.substring(0, 100);
                    logData.imagePrompt = imageResponse.prompt;
                    logger.info("Stream completed with [DONE] - image response", logData);
                    return { 
                      success: true, 
                      data: { type: "image", content: imageResponse.url, prompt: imageResponse.prompt } 
                    };
                  }
                  
                  logData.fullResponseLength = fullResponse.length;
                  const cleanedResponse = this.cleanResponse(fullResponse);
                  if (pendingUpdate) {
                    onChunk(cleanedResponse);
                  }
                  if (pendingReasoningUpdate && onReasoning) {
                    onReasoning(fullReasoning);
                  }
                  logger.info("Stream completed with [DONE] - raw fullResponse from AI service", logData);
                  return { success: true, data: { type: "text", content: cleanedResponse } };
                }

                try {
                  const parsed = JSON.parse(data) as { 
                    content?: string; 
                    reasoning?: string;
                    error?: string;
                    type?: "image" | "youtube";
                    prompt?: string;
                    videoId?: string;
                    explanation?: string;
                  };
                  
                  // Handle reasoning content
                  if (parsed.reasoning) {
                    fullReasoning += parsed.reasoning;
                    throttledOnReasoning(fullReasoning);
                  }
                  
                  // Handle image response from backend
                  if (parsed.type === "image" && parsed.content) {
                    logData.imageReceived = true;
                    logData.imageUrl = parsed.content.substring(0, 100);
                    logData.imagePrompt = parsed.prompt;
                    logger.image(parsed.content, 'Stream image response', { prompt: parsed.prompt });
                    imageResponse = { url: parsed.content, prompt: parsed.prompt };
                    if (onImage) {
                      onImage(parsed.content, parsed.prompt);
                    }
                  } else if (parsed.type === "youtube" && parsed.videoId) {
                    logData.youtubeReceived = true;
                    logData.youtubeVideoId = parsed.videoId;
                    logData.youtubeExplanation = parsed.explanation;
                    logData.hasYoutubeCallback = !!onYoutube;
                    if (onYoutube) {
                      onYoutube(parsed.videoId, parsed.explanation);
                    }
                  } else if (parsed.content) {
                    fullResponse += parsed.content;
                    throttledOnChunk(fullResponse);
                  }
                  
                  if (parsed.error) {
                    const streamError = new Error(parsed.error);
                    logData.error = streamError.message;
                    logData.parsedError = parsed.error;
                    logger.error("Stream error from backend", logData);
                    return { success: false, error: streamError };
                  }
                } catch (parseError) {
                  // Skip invalid JSON but log it for debugging
                  logData.parseError = parseError instanceof Error ? parseError.message : String(parseError);
                  logData.data = data.substring(0, 200);
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      logData.error = error instanceof Error ? error.message : String(error);
      logger.error("StreamChat attempt failed", logData);
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error)) 
      };
    }
  }

  static cleanResponse(response: string): string {
    if (!response || response.trim().length === 0) {
      return response;
    }
    
    const logData: {
      bracketWrapCleaned?: boolean;
      bracketPartialCleaned?: boolean;
      xmlWrapCleaned?: boolean;
      xmlPartialCleaned?: boolean;
      separatorCleaned?: boolean;
      originalLength?: number;
      cleanedLength?: number;
      original?: string;
      error?: string;
    } = {};
    
    let cleaned = response.trim();
    const originalLength = cleaned.length;
    logData.originalLength = originalLength;
    
    // Pattern 1: Remove bracket-style metadata tags with replying-to attribute (new format)
    // Handles: [Q1 replying-to="A2"]content[/Q1], [A1]content[/A1], etc.
    const bracketWrapMatch = cleaned.match(/^\[(Q|A|DOC|CTX|[A-Z]+)\d+(?:\s+replying-to="[^"]*")?\]\s*([\s\S]*?)\s*\[\/\1\d+\]$/i);
    if (bracketWrapMatch) {
      const extracted = bracketWrapMatch[2].trim();
      if (extracted.length > 0) {
        logData.bracketWrapCleaned = true;
        cleaned = extracted;
      }
    }
    
    // Pattern 2: Remove any remaining bracket tags anywhere in response
    const beforeBracketClean = cleaned;
    cleaned = cleaned
      .replace(/\[(Q|A|DOC|CTX|[A-Z]+)\d+(?:\s+replying-to="[^"]*")?\]/gi, '') // Remove opening tags with optional replying-to
      .replace(/\[\/(Q|A|DOC|CTX|[A-Z]+)\d+\]/gi, ''); // Remove closing tags
    
    if (beforeBracketClean !== cleaned) {
      logData.bracketPartialCleaned = true;
    }
    
    // Pattern 3: Remove old-style XML node tags (backward compatibility)
    // Handles: <node ...>content</node>
    const fullWrapMatch = cleaned.match(/^<node[^>]*>([\s\S]*?)<\/node>$/i);
    if (fullWrapMatch) {
      const extracted = fullWrapMatch[1].trim();
      if (extracted.length > 0) {
        logData.xmlWrapCleaned = true;
        cleaned = extracted;
      }
    }
    
    // Pattern 4: Remove any remaining old-style XML tags
    const beforeXmlClean = cleaned;
    cleaned = cleaned
      .replace(/<node[^>]*>/gi, '') // Remove all opening tags
      .replace(/<\/node>/gi, ''); // Remove all closing tags
    
    if (beforeXmlClean !== cleaned) {
      logData.xmlPartialCleaned = true;
    }
    
    // Pattern 5: Remove separator tags
    const beforeSeparatorClean = cleaned;
    cleaned = cleaned.replace(/<separatorOfContextualData\s*\/>/gi, '');
    
    if (beforeSeparatorClean !== cleaned) {
      logData.separatorCleaned = true;
    }
    
    // Final trim
    cleaned = cleaned.trim();
    logData.cleanedLength = cleaned.length;
    
    // Safety check: If cleaning removed everything, return original (better than losing content)
    if (cleaned.length === 0 && originalLength > 0) {
      logData.error = "Cleaning resulted in empty response";
      logData.original = response.substring(0, 200);
      logger.error("Cleaning resulted in empty response - returning original to prevent data loss", logData);
      return response.trim();
    }
    
    if (logData.bracketWrapCleaned || logData.bracketPartialCleaned || logData.xmlWrapCleaned || logData.xmlPartialCleaned || logData.separatorCleaned) {
      logger.warn("Model leaked metadata tags - cleaning response", logData);
    }
    
    return cleaned;
  }

  static async fastChat(messages: ChatMessage[]) {
    const logData: {
      status?: number;
      statusText?: string;
      errorText?: string;
      error?: string;
      rawTextLength?: number;
    } = {};

    const response = await fetch(`${globals.graphLLMBackendUrl}/api/v1/chat`, {
      method: "POST",
      headers: getRequestHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        messages,
        model: "openai/gpt-oss-120b",
        provider: {
          sort: "latency",
        },
      }),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      const error = new Error(
        `Server error (${response.status}): ${errorText || response.statusText}`
      );
      logData.status = response.status;
      logData.statusText = response.statusText;
      logData.errorText = errorText;
      logData.error = error.message;
      logger.error("Backend error in fastChat", logData);
      throw error;
    }
    
    const rawText = await response.text();
    logData.rawTextLength = rawText.length;
    logger.info("Raw response from AI service (fastChat)", logData);
    return this.cleanResponse(rawText);
  }
}
