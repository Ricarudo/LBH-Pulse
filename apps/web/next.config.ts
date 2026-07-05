import type { NextConfig } from "next";

const pulseApiUrl = process.env.PULSE_API_URL || "http://localhost:3000";
const allowedDevOrigins = (
  process.env.PULSE_ALLOWED_DEV_ORIGINS || "192.168.1.*"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: process.cwd()
  },
  allowedDevOrigins,
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
