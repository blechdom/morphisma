import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath: "/morphisma",
  images: { unoptimized: true },
};

export default nextConfig;
