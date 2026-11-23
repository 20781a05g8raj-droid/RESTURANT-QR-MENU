const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MAX_RAW_FILE_BYTES = 12 * 1024 * 1024; // 12 MB per uploaded file

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Selected file is not a valid image.'));
    img.src = src;
  });
}

/**
 * Validates and compresses a browser-selected food photo into a compact JPEG data URL
 * (max 720px on the longest side) so multiple dish images persist smoothly in local storage.
 */
export async function compressImageFileToDataUrl(
  file: File,
  maxDimension = 720,
  quality = 0.78
): Promise<string> {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type.toLowerCase())) {
    throw new Error(`Unsupported file "${file.name}". Please upload JPG, PNG, or WebP photos.`);
  }
  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error(`"${file.name}" is larger than 12 MB. Please choose a smaller photo.`);
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const img = await loadImageElement(rawDataUrl);

  const scale = Math.min(1, maxDimension / Math.max(img.width || 1, img.height || 1));
  const targetWidth = Math.max(1, Math.round(img.width * scale));
  const targetHeight = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return rawDataUrl;
  }

  // Fill with white so transparent PNGs render cleanly as compressed JPEGs
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  return canvas.toDataURL('image/jpeg', quality);
}
