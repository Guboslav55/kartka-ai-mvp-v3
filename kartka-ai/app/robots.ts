import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = 'https://kartka-ai-mvp-v3.vercel.app'
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/generate', '/studio', '/admin', '/api/', '/stars', '/referral', '/profile', '/gallery'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
