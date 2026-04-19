import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  devIndicators: false,
  allowedDevOrigins: ['hatai.io.vn'],
  experimental: {},
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: ['node-ssh', 'ssh2', 'cpu-features', 'sshcrypto'],
};

export default nextConfig;
