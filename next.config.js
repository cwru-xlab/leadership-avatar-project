/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Turbopack rooted on this app (a parent package-lock.json otherwise
  // makes Next infer the wrong workspace root during builds).
  turbopack: { root: __dirname },
  // Native canvas binary used by PDF page → PNG rasterization. Must not be
  // bundled by Turbopack.
  serverExternalPackages: [
    "@napi-rs/canvas",
    "@napi-rs/canvas-linux-x64-gnu",
    "@napi-rs/canvas-linux-arm64-gnu",
    "pdfjs-dist",
  ],
  // Practice deck uploads allow up to 25MB plus multipart overhead. The
  // default proxy body buffer truncates large FormData uploads.
  experimental: { proxyClientMaxBodySize: "32mb" },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "case-study-ai-avatar.s3.us-east-2.amazonaws.com", pathname: "/**" },
      { protocol: "https", hostname: "*.s3.*.amazonaws.com", pathname: "/**" },
      { protocol: "https", hostname: "s3.*.amazonaws.com", pathname: "/**" },
    ],
  },
  /**
   * Permanent redirects from legacy student URLs to the canonical practice
   * hierarchy. Specific report paths precede shorter session paths.
   * `/case-play/:caseId` intentionally retains its runtime ownerId dispatch.
   */
  async redirects() {
    // Keep literal `new` ahead of dynamic rules and never let it be captured.
    const segment = "((?!new(?:/|$))[^/]+)";
    return [
      // Reports first: report URLs must not be swallowed by session rules.
      { source: `/interview/:type${segment}/report/:reportId${segment}`, destination: "/reports/:reportId", permanent: true },
      { source: `/case-play/:caseId${segment}/report/:reportId${segment}`, destination: "/reports/:reportId", permanent: true },
      { source: "/practice/:type/report/:reportId", destination: "/reports/:reportId", permanent: true },

      { source: "/case-play/new", destination: "/practice/case-studies/new", permanent: true },
      { source: `/case-play/:caseId${segment}/edit`, destination: "/practice/case-studies/:caseId/edit", permanent: true },
      { source: "/case-play", destination: "/practice/case-studies", permanent: true },
      // Do not redirect /case-play/:caseId: it owns the legacy-admin runtime.

      { source: "/conversations/new", destination: "/practice/courageous-conversations/new", permanent: true },
      { source: `/conversations/:id${segment}`, destination: "/practice/courageous-conversations/:id/edit", permanent: true },
      { source: "/conversations", destination: "/practice/courageous-conversations", permanent: true },

      { source: "/interview", destination: "/practice/interviews", permanent: true },
      { source: `/interview/:type${segment}`, destination: "/practice/interviews/:type", permanent: true },
      { source: "/practice/case-study/:caseId", destination: "/practice/case-studies/:caseId", permanent: true },
      { source: "/practice/difficult-conversation/:id", destination: "/practice/courageous-conversations/:id", permanent: true },
      // These former flat interview engines are now named under /practice/interviews.
      // Keep this list explicit: /practice/[type] remains a fallback for non-interview
      // engine types that have no named adapter yet.
      { source: "/practice/general", destination: "/practice/interviews/general", permanent: true },
      { source: "/practice/technical", destination: "/practice/interviews/technical", permanent: true },
      { source: "/practice/consulting", destination: "/practice/interviews/consulting", permanent: true },
      { source: "/practice/early-career", destination: "/practice/interviews/early-career", permanent: true },
      { source: "/practice/pitch-elevator", destination: "/practice/pitches/elevator", permanent: true },
      { source: "/practice/pitch-deck", destination: "/practice/pitches/deck/pitch-deck", permanent: true },
      { source: "/practice/pitch-funding", destination: "/practice/pitches/deck/pitch-funding", permanent: true },
      { source: "/practice/pitch-product", destination: "/practice/pitches/deck/pitch-product", permanent: true },
      { source: "/practice/pitch-talk", destination: "/practice/pitches/deck/pitch-talk", permanent: true },
      { source: "/practice/pitch-general", destination: "/practice/pitches/deck/pitch-general", permanent: true },
    ];
  },
};

module.exports = nextConfig;
