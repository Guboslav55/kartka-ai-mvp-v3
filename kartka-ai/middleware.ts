import { NextRequest, NextResponse } from 'next/server'

// Protected routes that require auth
const PROTECTED = ['/dashboard', '/generate', '/studio', '/stars', '/referral', '/profile', '/gallery', '/admin', '/onboarding', '/projects', '/card']
// Public routes always accessible
const PUBLIC = ['/', '/auth', '/pricing', '/sitemap.xml', '/robots.txt']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Skip API routes, static files, Next.js internals
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  // Check if protected route
  const isProtected = PROTECTED.some(p => pathname.startsWith(p))
  if (!isProtected) return NextResponse.next()

  // Check for Supabase auth cookie
  const authToken = req.cookies.get('sb-access-token')?.value
    || req.cookies.get('supabase-auth-token')?.value
    || req.cookies.get('sb-' + (process.env.NEXT_PUBLIC_SUPABASE_URL || '').split('//')[1]?.split('.')[0] + '-auth-token')?.value

  // Also check localStorage-based auth via cookie set by app
  const hasAuth = !!authToken || req.cookies.getAll().some(c => c.name.includes('auth-token') || c.name.includes('sb-'))

  if (!hasAuth) {
    const url = req.nextUrl.clone()
    url.pathname = '/auth'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)'],
}
