import { globals } from "../globals";
import { createFileFormData } from "../utils/formData";
import logger from "../utils/logger";

export interface UploadFileResult {
  url: string;
}

export class storageService {
  /**
   * Upload a file to the backend storage service
   * @param file - The file to upload
   * @returns Promise that resolves to the upload result with the file URL, or null if upload failed
   */
  static async uploadFile(file: File): Promise<UploadFileResult | null> {
    const formData = createFileFormData(file);
    const uploadUrl = `${globals.graphLLMBackendUrl}/api/v1/storage/upload`;

    try {
      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const responseText = await response.text();
        logger.error(`Failed to upload ${file.name}`, {
          status: response.status,
          statusText: response.statusText,
          backendUrl: uploadUrl,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          responseBody: responseText,
        });
        return null;
      }

      const data = (await response.json()) as UploadFileResult;
      return data;
    } catch (error) {
      logger.error(`Network error uploading ${file.name}`, {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : undefined,
        backendUrl: uploadUrl,
      });
      return null;
    }
  }
}

