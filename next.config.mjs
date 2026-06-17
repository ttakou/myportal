/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["react-leaflet", "@react-leaflet/core"],
  // Tree-shake large named-export packages so a page only ships the icons it
  // actually imports rather than the whole module graph.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
