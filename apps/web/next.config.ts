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
      // Web-owned quote/BOM/item handlers use /workspace-api so this legacy
      // proxy can continue serving the rest of the Nest API without shadowing them.
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
