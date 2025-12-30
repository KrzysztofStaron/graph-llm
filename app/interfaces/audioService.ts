import { globals } from "../globals";

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface TextToSpeechResult {
  audio: HTMLAudioElement;
  audioUrl: string;
  words?: WordTimestamp[];
  duration?: number;
}

export class audioService {
  /**
   * Convert text to speech using Deepgram TTS API with streaming
   * The backend streams the response, and we collect chunks on the frontend
   * This reduces latency by not buffering the entire response before sending
   * @param text - The text to convert to speech
   * @param includeTimestamps - Whether to include word-level timestamps (requires transcription)
   * @returns Promise that resolves to an object containing the Audio element, its blob URL, and optional timestamps
   */
  static async textToSpeech(
    text: string,
    includeTimestamps = false
  ): Promise<TextToSpeechResult> {
    const response = await fetch(
      `${globals.graphLLMBackendUrl}/api/v1/text-to-speech`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, includeTimestamps }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Backend error:", errorText);
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${errorText}`
      );
    }

    // If timestamps are requested, response will be JSON with base64 audio
    if (includeTimestamps) {
      const data = (await response.json()) as {
        audio: string;
        words: WordTimestamp[];
        duration: number;
      };

      // Convert base64 audio to blob
      const audioBytes = Uint8Array.from(atob(data.audio), (c) =>
        c.charCodeAt(0)
      );
      const audioBlob = new Blob([audioBytes], { type: "audio/mpeg" });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      return {
        audio,
        audioUrl,
        words: data.words,
        duration: data.duration,
      };
    }

    // Otherwise, stream the audio response and collect chunks
    if (!response.body) {
      throw new Error("Response body is null");
    }

    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Combine all chunks into a single blob
    const audioBlob = new Blob(chunks, { type: "audio/mpeg" });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    return { audio, audioUrl };
  }
}
