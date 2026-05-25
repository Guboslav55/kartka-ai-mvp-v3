import { MetadataRoute } from 'next'
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/dashboard', '/generate', '/studio', '/admin', '/api/'] },
    sitemap: 'https://kartka-ai-mvp-v3.vercel.app/sitemap.xml',
  }
}
