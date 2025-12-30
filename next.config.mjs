const nextConfig = {
  images: {
    domains: ['ipfs.io', 'gateway.pinata.cloud', 'cloudflare-ipfs.com'],
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
