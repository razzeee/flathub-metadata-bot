/**
 * Image Utilities
 * Handles image downloading and processing for branding color generation
 */

/**
 * Download an image from a URL to a local file
 * @param url - URL of the image to download
 * @param outputPath - Local path to save the image
 */
export async function downloadImage(
  url: string,
  outputPath: string,
): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to download image: ${response.status} ${response.statusText}`,
    );
  }

  if (!response.body) {
    throw new Error("Image response body is empty");
  }

  const file = await Deno.open(outputPath, {
    write: true,
    create: true,
    truncate: true,
  });

  try {
    await response.body.pipeTo(file.writable);
  } catch (error) {
    throw new Error(
      `Failed to write image to ${outputPath}: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
}

/**
 * Convert an image file to base64 encoding
 * @param imagePath - Path to the image file
 * @returns Base64 encoded string of the image
 */
export async function getImageBase64(imagePath: string): Promise<string> {
  try {
    const imageData = await Deno.readFile(imagePath);
    const base64 = btoa(String.fromCharCode(...imageData));
    return base64;
  } catch (error) {
    throw new Error(
      `Failed to read image file ${imagePath}: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
}

/**
 * Get the MIME type of an image based on its file extension
 * @param imagePath - Path to the image file
 * @returns MIME type string (e.g., "image/png")
 */
export function getImageMimeType(imagePath: string): string {
  const ext = imagePath.toLowerCase().split(".").pop();

  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "gif":
      return "image/gif";
    default:
      return "image/png"; // Default fallback
  }
}

/**
 * Create a data URL from an image file
 * @param imagePath - Path to the image file
 * @returns Data URL string (e.g., "data:image/png;base64,...")
 */
export async function getImageDataUrl(imagePath: string): Promise<string> {
  const base64 = await getImageBase64(imagePath);
  const mimeType = getImageMimeType(imagePath);
  return `data:${mimeType};base64,${base64}`;
}
