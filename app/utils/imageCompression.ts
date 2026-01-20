/**
 * Image compression utilities for handling large images on mobile devices.
 * Compresses images to reduce payload size while maintaining reasonable quality.
 */

// Maximum dimensions for images (maintain aspect ratio)
const MAX_IMAGE_WIDTH = 1920;
const MAX_IMAGE_HEIGHT = 1080;

// Maximum base64 data URL size in bytes (500KB)
// This keeps payloads reasonable for mobile networks
const MAX_DATA_URL_SIZE = 500 * 1024;

// Quality settings for JPEG compression (0-1)
const HIGH_QUALITY = 0.85;
const MEDIUM_QUALITY = 0.7;
const LOW_QUALITY = 0.5;

export interface CompressImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  maxSizeBytes?: number;
  initialQuality?: number;
}

/**
 * Compresses an image file to a data URL, resizing and reducing quality as needed.
 * Iteratively reduces quality if the result is still too large.
 */
export async function compressImageToDataUrl(
  file: File,
  options: CompressImageOptions = {}
): Promise<string> {
  const {
    maxWidth = MAX_IMAGE_WIDTH,
    maxHeight = MAX_IMAGE_HEIGHT,
    maxSizeBytes = MAX_DATA_URL_SIZE,
    initialQuality = HIGH_QUALITY,
  } = options;

  // Load the image
  const imageBitmap = await createImageBitmap(file);
  const { width: originalWidth, height: originalHeight } = imageBitmap;

  // Calculate scaled dimensions while maintaining aspect ratio
  let targetWidth = originalWidth;
  let targetHeight = originalHeight;

  if (originalWidth > maxWidth || originalHeight > maxHeight) {
    const widthRatio = maxWidth / originalWidth;
    const heightRatio = maxHeight / originalHeight;
    const ratio = Math.min(widthRatio, heightRatio);

    targetWidth = Math.round(originalWidth * ratio);
    targetHeight = Math.round(originalHeight * ratio);
  }

  // Create a canvas for compression
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context for image compression");
  }

  // Draw the image scaled to the target size
  ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
  imageBitmap.close();

  // Determine output format - use JPEG for photos, PNG for images with transparency
  const isPng = file.type === "image/png";
  const outputFormat = isPng ? "image/png" : "image/jpeg";

  // For PNGs, try JPEG first if the file is large (better compression)
  const useJpeg = !isPng || file.size > 100 * 1024;

  // Iteratively compress until we're under the size limit
  let quality = initialQuality;
  let dataUrl = canvas.toDataURL(
    useJpeg ? "image/jpeg" : outputFormat,
    quality
  );

  // Try reducing quality iteratively if still too large
  const qualities = [MEDIUM_QUALITY, LOW_QUALITY, 0.3, 0.2];
  for (const q of qualities) {
    if (dataUrl.length <= maxSizeBytes) break;
    quality = q;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  // If still too large, reduce dimensions further
  if (dataUrl.length > maxSizeBytes) {
    const scale = 0.7;
    canvas.width = Math.round(targetWidth * scale);
    canvas.height = Math.round(targetHeight * scale);

    // Re-create bitmap for rescaling
    const tempBitmap = await createImageBitmap(file);
    ctx.drawImage(tempBitmap, 0, 0, canvas.width, canvas.height);
    tempBitmap.close();

    dataUrl = canvas.toDataURL("image/jpeg", LOW_QUALITY);
  }

  return dataUrl;
}

/**
 * Compresses an existing data URL if it exceeds the size limit.
 * Returns the original if already small enough or compression fails.
 */
export async function compressDataUrlIfNeeded(
  dataUrl: string,
  maxSizeBytes: number = MAX_DATA_URL_SIZE
): Promise<string> {
  // If already small enough, return as-is
  if (dataUrl.length <= maxSizeBytes) {
    return dataUrl;
  }

  // Load the image from data URL
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image for compression"));
    img.src = dataUrl;
  });

  // Calculate target dimensions (reduce by ratio needed)
  const sizeRatio = maxSizeBytes / dataUrl.length;
  // Square root because area scales with square of linear dimensions
  const dimensionRatio = Math.sqrt(sizeRatio) * 0.8; // Add some margin

  const targetWidth = Math.max(100, Math.round(img.width * dimensionRatio));
  const targetHeight = Math.max(100, Math.round(img.height * dimensionRatio));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return dataUrl; // Return original if canvas fails
  }

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // Use JPEG for better compression
  let compressed = canvas.toDataURL("image/jpeg", MEDIUM_QUALITY);

  // If still too large, reduce quality further
  if (compressed.length > maxSizeBytes) {
    compressed = canvas.toDataURL("image/jpeg", LOW_QUALITY);
  }

  // If still too large, reduce dimensions more aggressively
  if (compressed.length > maxSizeBytes) {
    canvas.width = Math.round(targetWidth * 0.5);
    canvas.height = Math.round(targetHeight * 0.5);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    compressed = canvas.toDataURL("image/jpeg", LOW_QUALITY);
  }

  return compressed.length < dataUrl.length ? compressed : dataUrl;
}

/**
 * Estimates the approximate size of a data URL in bytes.
 */
export function getDataUrlSize(dataUrl: string): number {
  return dataUrl.length;
}

/**
 * Checks if a value is a base64 data URL.
 */
export function isDataUrl(url: string): boolean {
  return url.startsWith("data:");
}

/**
 * Checks if a value is a hosted URL (http/https).
 */
export function isHostedUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

