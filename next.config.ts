import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // outputFileTracingRoot: path.resolve(__dirname, '../../'),  // Uncomment and add 'import path from "path"' if needed
  /* config options here */
  allowedDevOrigins: ['*.dev.coze.site', 'localhost', '127.0.0.1'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
  // ReUp v2 Phase 5: pdfkit pulls in fontkit which uses `@swc/helpers`
  // exports that conflict with Next.js's bundled `@swc/helpers`. Mark
  // it as a server-external package so Turbopack/webpack don't try to
  // bundle the ESM graph and instead use the Node CommonJS entry at
  // runtime. fontkit is the actual offender, but listing the parent
  // pdfkit is enough.
  //
  // `@xenova/transformers` (Phase 1 R2 reranker) is an optional
  // dependency loaded via dynamic import; it is not in package.json and
  // would otherwise fail Turbopack's static import analysis. Listing
  // it here bypasses the resolve at bundle time.
  serverExternalPackages: ['pdfkit', 'fontkit', '@xenova/transformers'],
};

export default nextConfig;
