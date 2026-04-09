import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath: isProd ? "/morphisma" : "",
  images: { unoptimized: true },
};

export default nextConfig;
