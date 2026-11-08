/* Field Copilot service worker: lets the app open and run without signal.
 *
 * - Pages: network first (with a timeout), falling back to the cached copy. Jobs and notes
 *   use one cached template per screen type, because those screens read the real job or
 *   note ID from the browser path. A job started offline therefore opens offline too.
 * - Built assets (/_next/static, /explorer, CDN libraries, OCR data): cache first. Their
 *   URLs are versioned or immutable.
 * - /api/* and Next.js data requests are never intercepted. AI features need a connection.
 *
 * The version comes from the registration URL (?v=build), so each deploy installs fresh.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const PAGES = `fc-pages-${VERSION}`;
const ASSETS = `fc-assets-${VERSION}`;
const RUNTIME = "fc-runtime-v1";
const NAV_TIMEOUT_MS = 4000;
const TEMPLATE = "__offline__";

const TOOL_IDS = ["maintenance", "electrical", "charge", "heatpump", "furnace", "gas", "static", "airflow", "airside", "compressor", "evacuation", "refrigerantLog", "insulation", "duct", "load", "explain"];
// Keep in sync with app/lib/troubleshoot/flows.ts (checked by a unit test).
const TROUBLESHOOT = ["no-cool-outdoor-off", "outdoor-fan-not-running", "compressor-not-starting", "poor-cooling", "frozen-coil", "no-blower", "furnace-no-heat", "furnace-short-cycle", "heat-pump-not-heating", "water-leak"];
const PRECACHE_PAGES = [
  "/", "/tools", "/notes", "/notes/new", "/photos", "/backup", "/settings", "/troubleshoot", "/tools/unit-explorer",
  ...TOOL_IDS.map((id) => `/tools/${id}`),
  ...TROUBLESHOOT.map((id) => `/troubleshoot/${id}`),
  `/job/${TEMPLATE}`, `/job/${TEMPLATE}/summary`, `/job/${TEMPLATE}/condenser`, `/job/${TEMPLATE}/condenser/electrical`, `/notes/${TEMPLATE}`,
];
const PRECACHE_ASSETS = [
  "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png", "/icon-180.png",
  "/explorer/index.html", "/explorer/css/style.css", "/explorer/js/main.js", "/explorer/js/parts.js", "/explorer/js/content.js",
  "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js",
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/environments/RoomEnvironment.js",
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js",
];
const CACHEABLE_HOSTS = new Set(["cdn.jsdelivr.net", "unpkg.com", "tessdata.projectnaptha.com", "fonts.googleapis.com", "fonts.gstatic.com"]);

/** Precached pages bring their own scripts and styles so every screen can hydrate offline. */
function assetUrls(html) {
  const urls = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) urls.add(match[1]);
  for (const match of html.matchAll(/\\?"(\/_next\/static\/[^"\\]+\.(?:js|css))\\?"/g)) urls.add(match[1]);
  return [...urls];
}

async function precache() {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(ASSETS);
  const wanted = new Set();
  await Promise.allSettled(PRECACHE_PAGES.map(async (path) => {
    const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return;
    const html = await response.clone().text();
    assetUrls(html).forEach((url) => wanted.add(url));
    await pages.put(path, response);
  }));
  await Promise.allSettled([...PRECACHE_ASSETS, ...wanted].map(async (url) => {
    if (await assets.match(url)) return;
    const response = await fetch(url, { credentials: url.startsWith("/") ? "same-origin" : "omit", mode: url.startsWith("/") ? "same-origin" : "cors" });
    if (response.ok) await assets.put(url, response);
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([PAGES, ASSETS, RUNTIME]);
    for (const key of await caches.keys()) if (key.startsWith("fc-") && !keep.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "fc-status") {
    caches.open(PAGES).then((cache) => cache.keys()).then((keys) => event.source && event.source.postMessage({ type: "fc-status", version: VERSION, pages: keys.length }));
  }
});

/** The cached page to show for a path when the network is unavailable. */
function templateFor(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "job" && parts.length >= 2) {
    if (parts.length === 2) return `/job/${TEMPLATE}`;
    if (parts.length === 3) return parts[2] === "summary" ? `/job/${TEMPLATE}/summary` : `/job/${TEMPLATE}/condenser`;
    return `/job/${TEMPLATE}/condenser/electrical`;
  }
  if (parts[0] === "notes" && parts.length === 2 && parts[1] !== "new") return `/notes/${TEMPLATE}`;
  return null;
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function navigate(request) {
  const url = new URL(request.url);
  const pages = await caches.open(PAGES);
  const network = fetch(request).then(async (response) => {
    // Only real pages are kept; job and note screens rely on their template instead.
    if (response.ok && !templateFor(url.pathname) && response.headers.get("content-type")?.includes("text/html")) await pages.put(url.pathname, response.clone());
    return response;
  });
  try {
    return await Promise.race([network, timeout(NAV_TIMEOUT_MS)]);
  } catch {
    const template = templateFor(url.pathname);
    const cached = (template && await pages.match(template)) || await caches.match(url.pathname) || (request.destination === "document" ? await pages.match("/") : undefined);
    if (cached) return cached;
    return network.catch(() => new Response("<h1>Offline</h1><p>This page has not been saved for offline use yet. Open it once with a connection.</p>", { status: 503, headers: { "content-type": "text/html; charset=utf-8" } }));
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = (await caches.match(request, { ignoreVary: true }));
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const hit = await caches.match(request);
  const update = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  });
  if (hit) { update.catch(() => undefined); return hit; }
  return update;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin) {
    if (CACHEABLE_HOSTS.has(url.hostname)) event.respondWith(cacheFirst(request, RUNTIME));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;
  // Next.js data requests: on failure the router falls back to a full page load, served above.
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return;
  if (request.mode === "navigate") { event.respondWith(navigate(request)); return; }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/explorer/")) { event.respondWith(cacheFirst(request, ASSETS)); return; }
  event.respondWith(staleWhileRevalidate(request));
});
