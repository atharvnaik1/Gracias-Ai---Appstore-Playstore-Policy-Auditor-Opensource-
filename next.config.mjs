js
/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  // Enable serverless output for Vercel
  output: 'standalone',
  // Ensure clean URLs
  trailingSlash: true,
  // Set asset prefix based on Vercel URL (or fallback to env variable)
  assetPrefix: process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.ASSET_PREFIX || '',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    appDir: true,
  },
  images: {
    domains: ['example.com', 'logo.com'],
  },
  redirects: async () => [
    {
      source: '/old-path',
      destination: '/new-path',
      permanent: true,
    },
  ],
  rewrites: async () => [
    {
      source: '/api/:slug*',
      destination: '/api/:slug*',
    },
  ],
  webpack: (config, { isServer }) => {
    // Resolve TypeScript extensions
    config.resolve.extensions.push('.ts', '.tsx');

    // Add CSS handling
    config.module.rules.push({
      test: /\.css$/,
      use: ['style-loader', 'css-loader'],
    });

    // Alias for source directory
    config.resolve.alias['@src'] = path.resolve(__dirname, 'src');

    // Adjustments for serverless functions
    if (isServer) {
      // Prevent bundling of native node modules that are not needed in serverless
      config.externals = [
        ...(config.externals || []),
        // Add any server‑side only modules here if needed
      ];
    }

    return config;
  },
};

module.exports = nextConfig;