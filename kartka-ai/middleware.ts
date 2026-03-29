import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Protect private routes
  const protectedRoutes = ['/dashboard', '/generate', '/pricing', '/onboarding', '/banner', '/card'];
  if (protectedRoutes.some(r => path.startsWith(r)) && !user) {
    return NextResponse.redirect(new URL('/auth', request.url));
  }

  // Auth page — if logged in go to dashboard, NOT to pricing or anywhere else
  if (path === '/auth' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Root page — always accessible, never redirect
  // (do NOT redirect logged-in users away from '/')

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/generate/:path*',
    '/pricing/:path*',
    '/onboarding/:path*',
    '/banner/:path*',
    '/card/:path*',
    '/auth',
  ],
};
