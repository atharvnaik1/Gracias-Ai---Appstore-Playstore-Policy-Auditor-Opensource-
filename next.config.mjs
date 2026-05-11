js
/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  target: 'serverless',
  output: 'standalone',
  trailingSlash: true,
  assetPrefix: process.env.ASSET_PREFIX || '',
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
    config.resolve.extensions.push('.ts', '.tsx');
    config.module.rules.push({
      test: /\.css$/,
      use: ['style-loader', 'css-loader'],
    });
    config.resolve.alias['@src'] = path.resolve(__dirname, 'src');
    return config;
  },
};

module.exports = nextConfig;