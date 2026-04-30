/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/finance-tracker',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
