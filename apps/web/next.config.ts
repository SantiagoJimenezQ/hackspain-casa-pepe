import { LEGACY_LOGOS } from "../../packages/demo-brands";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async redirects() {
    return Object.entries(LEGACY_LOGOS).map(([source, destination]) => ({ source, destination, permanent: true }));
  },
};

export default nextConfig;
