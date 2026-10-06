"use client";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 24_000_000;
const MAX_LONG_EDGE = 2200;
const MAX_UPSCALE = 2;

export type PreparedNameplateImage = {
  colorDataUrl: string;
  enhancedDataUrl: string;
  ocrDataUrls: string[];
  width: number;
  height: number;
};

export class NameplateImageError extends Error {
  constructor(public code: "unsupported_format" | "too_large" | "decode_failed" | "too_many_pixels", message: string) {
    super(message);
    this.name = "NameplateImageError";
  }
}

async function detectImageType(file: File): Promise<"jpeg" | "png" | "webp"> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isWebp = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF" && String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === "WEBP";
  const brand = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7], bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
  if (isJpeg) return "jpeg";
  if (isPng) return "png";
  if (isWebp) return "webp";
  if (brand.includes("ftypheic") || brand.includes("ftypheif") || brand.includes("ftypmif1")) {
    throw new NameplateImageError("unsupported_format", "HEIC photos are not supported in this browser. Retake the photo in the app or choose a JPEG, PNG, or WebP image.");
  }
  throw new NameplateImageError("unsupported_format", "Choose a JPEG, PNG, or WebP image.");
}

async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    }
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = "async";
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Image decode failed"));
        image.src = objectUrl;
      });
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => undefined };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    throw new NameplateImageError("decode_failed", "The image could not be opened. Retake the photo or choose a different file.");
  }
}

function canvasToDataUrl(canvas: HTMLCanvasElement, quality = 0.9): string {
  return canvas.toDataURL("image/jpeg", quality);
}

function histogramLimit(histogram: Uint32Array, total: number, fraction: number): number {
  const target = total * fraction;
  let count = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    count += histogram[value];
    if (count >= target) return value;
  }
  return 255;
}

function grayscaleForOcr(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new NameplateImageError("decode_failed", "This browser could not prepare the image for OCR.");
  context.drawImage(source, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const histogram = new Uint32Array(256);
  for (let index = 0; index < pixels.length; index += 4) {
    const gray = Math.round(0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2]);
    histogram[gray] += 1;
  }
  const total = canvas.width * canvas.height;
  const low = histogramLimit(histogram, total, 0.01);
  const high = histogramLimit(histogram, total, 0.99);
  const useAutoLevels = high - low >= 24;
  const range = useAutoLevels ? high - low : 255;
  for (let index = 0; index < pixels.length; index += 4) {
    const gray = 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2];
    const leveled = useAutoLevels ? ((gray - low) * 255) / range : gray;
    const contrasted = Math.max(0, Math.min(255, (leveled - 128) * 1.18 + 128));
    pixels[index] = contrasted;
    pixels[index + 1] = contrasted;
    pixels[index + 2] = contrasted;
    pixels[index + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function thresholdForOcr(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new NameplateImageError("decode_failed", "This browser could not prepare the high-contrast image for OCR.");
  context.drawImage(source, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const histogram = new Uint32Array(256);
  for (let index = 0; index < pixels.length; index += 4) histogram[Math.round(pixels[index])] += 1;
  const threshold = histogramLimit(histogram, canvas.width * canvas.height, 0.58);
  for (let index = 0; index < pixels.length; index += 4) {
    const value = pixels[index] < threshold ? 0 : 255;
    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
    pixels[index + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

export async function prepareNameplateImage(file: File, rotation = 0): Promise<PreparedNameplateImage> {
  if (file.size > MAX_FILE_BYTES) {
    throw new NameplateImageError("too_large", "The photo is larger than 10 MB. Choose a smaller image or retake it at standard resolution.");
  }
  await detectImageType(file);
  const decoded = await decodeImage(file);
  try {
    if (!decoded.width || !decoded.height) throw new NameplateImageError("decode_failed", "The image has invalid dimensions.");
    if (decoded.width * decoded.height > MAX_SOURCE_PIXELS) {
      throw new NameplateImageError("too_many_pixels", "The photo resolution is too large. Retake it at standard resolution.");
    }
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const swapsSides = normalizedRotation === 90 || normalizedRotation === 270;
    const rotatedWidth = swapsSides ? decoded.height : decoded.width;
    const rotatedHeight = swapsSides ? decoded.width : decoded.height;
    const scale = Math.min(MAX_UPSCALE, MAX_LONG_EDGE / Math.max(rotatedWidth, rotatedHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(rotatedWidth * scale));
    canvas.height = Math.max(1, Math.round(rotatedHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new NameplateImageError("decode_failed", "This browser could not prepare the image.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((normalizedRotation * Math.PI) / 180);
    context.drawImage(
      decoded.source,
      -Math.round(decoded.width * scale) / 2,
      -Math.round(decoded.height * scale) / 2,
      Math.round(decoded.width * scale),
      Math.round(decoded.height * scale),
    );
    const grayscale = grayscaleForOcr(canvas);
    const threshold = thresholdForOcr(grayscale);
    const enhancedDataUrl = canvasToDataUrl(grayscale, 0.94);
    return {
      colorDataUrl: canvasToDataUrl(canvas, 0.9),
      enhancedDataUrl,
      ocrDataUrls: [enhancedDataUrl, canvasToDataUrl(threshold, 0.94)],
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    decoded.close();
  }
}
