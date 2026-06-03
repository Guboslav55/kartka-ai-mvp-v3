/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'oaidalleapiprodscus.blob.core.windows.net' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'replicate.delivery' },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['@napi-rs/canvas'],
    serverActions: { bodySizeLimit: '20mb' },
    // Кладём файл шрифта внутрь серверной функции инфографики,
    // чтобы кириллица рисовалась на Vercel.
    outputFileTracingIncludes: {
      '/api/generate-infographic': [
        './public/fonts/DejaVuSans.ttf',
        './public/fonts/DejaVuSans-Bold.ttf',
      ],
      '/api/studio/generate': [
        './public/fonts/DejaVuSans.ttf',
        './public/fonts/DejaVuSans-Bold.ttf',
        './public/fonts/Inter.ttf',
        './public/fonts/ARIAL.TTF',
        './public/fonts/ARIALBD.TTF',
      ],
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude native binary packages from webpack bundling
      const externals = Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)
      config.externals = [...externals, '@napi-rs/canvas']
    }
    // Tell webpack to ignore .node binary files
    config.module.rules.push({
      test: /\.node$/,
      loader: 'ignore-loader',
    })
    return config
  },
};

module.exports = nextConfig;
