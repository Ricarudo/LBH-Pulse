import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: process.cwd()
  },
  allowedDevOrigins: ["192.168.1.12"]
};

export default nextConfig;
