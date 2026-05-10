js
/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  output: "standalone",
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
    domains: ["example.com"], // replace with your actual image domain(s)
  },
  webpack: (config) => {
    config.resolve.alias["@src"] = path.resolve(__dirname, "src");
    return config;
  },
};

module.exports = nextConfig;