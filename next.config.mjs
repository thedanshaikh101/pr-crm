/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: { serverComponentsExternalPackages: ["bullmq", "ioredis", "@prisma/client"] },
};
export default nextConfig;
