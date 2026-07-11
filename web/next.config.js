/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
  images: {
    domains: ['localhost'],
  },
  // 代理 JimuReport 积木报表请求到独立服务
  async rewrites() {
    return [
      {
        source: '/jmreport/:path*',
        destination: `${process.env.NEXT_PUBLIC_JIMUREPORT_URL || 'http://jimureport:8085'}/jmreport/:path*`,
      },
    ]
  },
};

module.exports = nextConfig;
