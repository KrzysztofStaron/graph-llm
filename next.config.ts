import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["d3", "pdfjs-dist"],
  turbopack: {
    root: ".",
  },
};

export default nextConfig;
