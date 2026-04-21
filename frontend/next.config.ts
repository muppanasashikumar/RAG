import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["192.168.0.179", "localhost", "127.0.0.1"],
};

export default nextConfig;
