import type { NextConfig } from "next";
import { resolve } from "node:path";

const pulseApiUrl = process.env.PULSE_API_URL || "http://localhost:3000";
const workspaceRoot = resolve(process.cwd(), "../..");
const allowedDevOrigins = (
  process.env.PULSE_ALLOWED_DEV_ORIGINS || "localhost,127.0.0.1,192.168.1.*"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: workspaceRoot
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
