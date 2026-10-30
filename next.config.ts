import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // Bundle the seed SQLite for local/dev; production on Vercel uses Turso.
  outputFileTracingIncludes: {
    "/**": ["./data/pos.sqlite"],
  },
  serverExternalPackages: ["@libsql/client", "xlsx"],
};

export default nextConfig;
