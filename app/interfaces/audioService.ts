import { globals } from "../globals";

export interface TextToSpeechResult {
  audio: HTMLAudioElement;
  audioUrl: string;
}

export class audioService {
  /**
   * Convert text to speech using Deepgram TTS API
   * @param text - The text to convert to speech
   * @returns Promise that resolves to an object containing the Audio element and its blob URL
   */
  static async textToSpeech(text: string): Promise<TextToSpeechResult> {
    const response = await fetch(
      `${globals.graphLLMBackendUrl}/api/v1/text-to-speech`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Backend error:", errorText);
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${errorText}`
      );
    }

    // Get audio blob and create Audio object
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    return { audio, audioUrl };
  }
}
