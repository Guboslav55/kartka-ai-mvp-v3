import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

export async function GET(req: NextRequest) {
  const checks: Record<string, any> = {}
  
  const dirs = [
    process.cwd(),
    path.join(process.cwd(), 'public'),
    path.join(process.cwd(), 'public/fonts'),
    '/var/task/public/fonts',
    '/usr/share/fonts/truetype/dejavu',
  ]
  
  for (const d of dirs) {
    try {
      const exists = fs.existsSync(d)
      if (exists) {
        try {
          const files = fs.readdirSync(d).slice(0, 20)
          checks[d] = files
        } catch { checks[d] = 'EXISTS_NO_READ' }
      } else {
        checks[d] = 'NOT_FOUND'
      }
    } catch(e: any) { checks[d] = 'ERROR:' + e.message }
  }
  
  return NextResponse.json(checks)
}
