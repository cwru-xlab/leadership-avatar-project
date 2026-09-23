/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Turbopack rooted on this app (a parent package-lock.json otherwise
  // makes Next infer the wrong workspace root during builds).
  turbopack: {
    root: __dirname,
  },
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
};

module.exports = nextConfig;
