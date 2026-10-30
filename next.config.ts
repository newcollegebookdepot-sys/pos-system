import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // Bundle seed SQLite for offline local/shop production (default).
  outputFileTracingIncludes: {
    "/**": ["./data/pos.sqlite"],
  },
  serverExternalPackages: ["@libsql/client", "xlsx"],
};

export default nextConfig;
