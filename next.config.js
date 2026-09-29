/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async headers() {
    return [{
      source: "/api/admin",
      headers: [
        { key: "Access-Control-Allow-Origin", value: "*" },
        { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
        { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type" },
        { key: "Access-Control-Max-Age", value: "86400" }
      ]
    }];
  },
  webpack(config) {
    config.resolve.alias.canvas = false;
    return config;
  }
};

module.exports = nextConfig;
