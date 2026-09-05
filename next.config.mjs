/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ["bullmq", "ioredis", "@prisma/client"] },
};
export default nextConfig;
