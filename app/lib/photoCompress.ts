export const MAX_PHOTOS_PER_SYSTEM = 12;
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_QUALITY = 0.8;

/** Scales an image down to a JPEG for on-device storage. Throws a readable message on failure. */
export async function compressImage(source: Blob): Promise<Blob> {
  if (!source.type.startsWith("image/")) throw new Error("That file is not an image.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    throw new Error("This image could not be read. Try taking the photo again.");
  }
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot process images.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITY));
  if (!blob) throw new Error("The photo could not be saved. Try again.");
  return blob;
}
