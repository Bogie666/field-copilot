/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
  env: {
    // Versions the offline service worker so each deploy installs a fresh cache.
    NEXT_PUBLIC_APP_VERSION: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 12) || `local-${Date.now()}`,
  },
};
export default nextConfig;
