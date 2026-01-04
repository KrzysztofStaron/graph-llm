import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["d3", "pdfjs-dist"],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
