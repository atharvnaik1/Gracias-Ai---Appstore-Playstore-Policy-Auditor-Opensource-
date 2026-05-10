js
/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  output: "standalone",
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
    domains: ["example.com"],
  },
  webpack: (config, { isServer }) => {
    config.resolve.extensions.push('.ts', '.tsx');
    config.module.rules.push({
      test: /\.css$/,
      use: ['style-loader', 'css-loader'],
    });
    config.resolve.alias["@src"] = path.resolve(__dirname, "src");
    return config;
  },
};

module.exports = nextConfig;