// Simple in-memory rate limiter for Vercel serverless
// Resets on cold start - good enough for basic protection

const requests = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number; resetIn: number } {
  const now = Date.now()
  const record = requests.get(key)

  if (!record || now > record.resetAt) {
    requests.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: limit - 1, resetIn: windowMs }
  }

  if (record.count >= limit) {
    return { ok: false, remaining: 0, resetIn: record.resetAt - now }
  }

  record.count++
  return { ok: true, remaining: limit - record.count, resetIn: record.resetAt - now }
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of requests.entries()) {
    if (now > val.resetAt) requests.delete(key)
  }
}, 60000)
