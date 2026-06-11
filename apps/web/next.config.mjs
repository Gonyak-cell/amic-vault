/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@amic-vault/shared'],
};

export default nextConfig;
