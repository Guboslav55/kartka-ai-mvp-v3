import { MetadataRoute } from 'next'
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://kartka-ai-mvp-v3.vercel.app', lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: 'https://kartka-ai-mvp-v3.vercel.app/pricing', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: 'https://kartka-ai-mvp-v3.vercel.app/auth', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
  ]
}
