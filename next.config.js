/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Turbopack rooted on this app (a parent package-lock.json otherwise
  // makes Next infer the wrong workspace root during builds).
  turbopack: {
    root: __dirname,
  },
  // Native canvas binary used by PDF page → PNG rasterization (Phase 14-01 spike;
  // production deck pipeline will share this). Must not be bundled by Turbopack.
  serverExternalPackages: [
    "@napi-rs/canvas",
    "@napi-rs/canvas-linux-x64-gnu",
    "@napi-rs/canvas-linux-arm64-gnu",
    "pdfjs-dist",
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'case-study-ai-avatar.s3.us-east-2.amazonaws.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.s3.*.amazonaws.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 's3.*.amazonaws.com',
        pathname: '/**',
      },
    ],
  },
  /**
   * Permanent redirects from pre-Phase-13 session/report URLs into the
   * unified `/practice/[type]` engine (REQ-68). Report entries are listed
   * before the shorter session entries so the more-specific path wins.
   *
   * Constraints:
   * - Dynamic segments use `((?!new(?:/|$))[^/]+)` so the literal sibling
   *   `new` cannot match (protects `/case-play/new`). Plain `(?!new$)`
   *   fails here because path-to-regexp compiles the param into a larger
   *   pattern where `$` never sits at the segment boundary — verified by
   *   matching `/case-play/new/report/x` (must miss) vs `/case-play/newer/
   *   report/x` (must hit).
   * - There is intentionally NO redirect for `/case-play/:caseId` alone —
   *   that path keeps a runtime ownerId dispatch (plan 13-11).
   * - `/interview` and `/case-play` index pages are not redirected.
   */
  async redirects() {
    // Reject the literal segment "new"; allow "newer", UUIDs, slugs, etc.
    const seg = "((?!new(?:/|$))[^/]+)";
    return [
      {
        source: `/interview/:type${seg}/report/:reportId${seg}`,
        destination: "/practice/:type/report/:reportId",
        permanent: true,
      },
      {
        source: `/case-play/:caseId${seg}/report/:reportId${seg}`,
        destination: "/practice/case-study/report/:reportId",
        permanent: true,
      },
      {
        source: `/interview/:type${seg}`,
        destination: "/practice/:type",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
