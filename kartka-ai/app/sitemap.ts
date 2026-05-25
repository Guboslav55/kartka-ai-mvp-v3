import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://kartka-ai-mvp-v3.vercel.app'
  const now = new Date()
  return [
    { url: base,              lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${base}/auth`,    lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
  ]
}
