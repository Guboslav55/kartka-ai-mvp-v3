import { createClient } from '@supabase/supabase-js'

// Simple hash for cache key
function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

export function buildCacheKey(params: Record<string, unknown>): string {
  // Sort keys for consistent hashing
  const sorted = Object.keys(params).sort().reduce((acc, key) => {
    acc[key] = params[key]
    return acc
  }, {} as Record<string, unknown>)
  return hashString(JSON.stringify(sorted))
}

export async function checkCache(supabase: ReturnType<typeof createClient>, cacheKey: string): Promise<string[] | null> {
  try {
    const { data } = await supabase
      .from('generation_cache')
      .select('result_urls')
      .eq('cache_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (data?.result_urls?.length) {
      // Increment hit count async
      supabase.rpc('increment_cache_hits', { p_key: cacheKey }).then(() => {})
      return data.result_urls
    }
  } catch {}
  return null
}

export async function saveToCache(supabase: ReturnType<typeof createClient>, cacheKey: string, urls: string[]): Promise<void> {
  try {
    await supabase.from('generation_cache').upsert({
      cache_key: cacheKey,
      result_urls: urls,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'cache_key' })
  } catch {}
}
