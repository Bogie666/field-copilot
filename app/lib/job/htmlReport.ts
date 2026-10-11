import { officeEvidenceText, EXPORT_LIMITS } from "./report";
import type { Job } from "./types";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REPORT_IMAGE_BYTES = 50 * 1024 * 1024;
export const HTML_EXPORT_LIMITS = "This private report embeds the available saved photos and the recorded text. Any missing images are listed explicitly. It is a service-visit record, not a restorable backup, cloud copy or safety certification.";
const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(binary);
}

/** Local-only, self-contained report. User strings are escaped and images never fetch a URL. */
export async function exportOfficeHtml(job: Job, getPhotoBlob: (id: string) => Promise<Blob | null>): Promise<{ html: string; missingPhotoIds: string[] }> {
  const ids = [...new Set([...job.photos.map(photo => photo.id), ...[...job.findings, ...(job.findingHistory ?? [])].flatMap(finding => finding.photoIds ?? [])])];
  const images: string[] = [];
  const missing: Array<{ id: string; reason: string }> = [];
  let totalBytes = 0;
  for (const id of ids) {
    const meta = job.photos.find(photo => photo.id === id);
    try {
      const blob = await getPhotoBlob(id);
      if (!blob) { missing.push({ id, reason: "The saved image file is missing." }); continue; }
      if (!IMAGE_TYPES.has(blob.type) || blob.size === 0) { missing.push({ id, reason: "The stored file is not a supported JPEG, PNG or WebP image." }); continue; }
      if (blob.size > MAX_IMAGE_BYTES || totalBytes + blob.size > MAX_REPORT_IMAGE_BYTES) { missing.push({ id, reason: "The image exceeds the export size limit. Export this photo separately." }); continue; }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      totalBytes += bytes.length;
      images.push(`<figure><figcaption><strong>${escapeHtml(id)}</strong>${meta?.caption ? `: ${escapeHtml(meta.caption)}` : ""}</figcaption><img alt="${escapeHtml(meta?.caption || `Saved photo ${id}`)}" src="data:${blob.type};base64,${toBase64(bytes)}"></figure>`);
    } catch {
      missing.push({ id, reason: "The stored image could not be read. Retry the export or retrieve it separately." });
    }
  }
  const incomplete = missing.length ? `<section class="warning"><h2>Incomplete photo evidence</h2><p>${missing.length} referenced image(s) could not be embedded. Do not treat this report as containing all photo evidence.</p><ul>${missing.map(item => `<li>${escapeHtml(item.id)}: ${escapeHtml(item.reason)}</li>`).join("")}</ul></section>` : "";
  const text = officeEvidenceText(job).replace(EXPORT_LIMITS, HTML_EXPORT_LIMITS).replace("PHOTO METADATA (NO IMAGE FILES)", "PHOTO METADATA (AVAILABLE IMAGES EMBEDDED BELOW)");
  return {
    missingPhotoIds: missing.map(item => item.id),
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Private office report: ${escapeHtml(job.label || "Untitled job")}</title><style>body{font:16px/1.5 system-ui,sans-serif;color:#172027;background:#fff;max-width:960px;margin:32px auto;padding:0 20px}h1,h2{line-height:1.2}pre{font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.warning{border:2px solid #9b241c;padding:16px;margin:20px 0}figure{margin:24px 0;break-inside:avoid}figcaption{overflow-wrap:anywhere;margin-bottom:8px}img{max-width:100%;height:auto;max-height:900px;object-fit:contain}@media print{body{margin:0;max-width:none}img{max-height:700px}}@page{margin:16mm}</style></head><body><h1>Private office evidence</h1><p>${escapeHtml(HTML_EXPORT_LIMITS)}</p><p>Includes private job labels, identifiers and notes. Review the recipient before sharing.</p>${incomplete}<pre>${escapeHtml(text)}</pre><h2>Saved photo evidence</h2>${images.length ? images.join("\n") : "<p>No available images embedded.</p>"}</body></html>`,
  };
}
