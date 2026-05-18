// app/api/payment/packages/route.ts
import { NextResponse } from 'next/server'
import { STAR_PACKAGES } from '@/lib/stars'

export async function GET() {
  return NextResponse.json({ packages: STAR_PACKAGES })
}
