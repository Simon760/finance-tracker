/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  output: 'export',
  basePath: isProd ? '/finance-tracker' : '',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
