import { NextResponse } from 'next/server'
import { createClient } from '@/lib/db/supabase'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/signin', new URL(request.url).origin), { status: 303 })
}
