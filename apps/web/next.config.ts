import type { NextConfig } from "next";

const pulseApiUrl = process.env.PULSE_API_URL || "http://localhost:3000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: process.cwd()
  },
  allowedDevOrigins: ["192.168.1.12"],
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${pulseApiUrl}/api/:path*`
        }
      ]
    };
  }
};

export default nextConfig;
