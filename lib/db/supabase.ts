/**
 * Server-side Supabase client for the staff app.
 *
 * Always the ANON/PUBLISHABLE key with the user's session, never a service key.
 * RLS is the access-control boundary here — § 44-12-239.1(b) forecloses any
 * public read surface over the CDR file, and a service key would step straight
 * over the policies that enforce it.
 *
 * The one place that bypasses PostgREST is the ingest CLI, which uses a direct
 * connection for COPY. That runs on a workstation, not in the app.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (url === undefined || key === undefined) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set. ' +
        'See .env.example.',
    )
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component; the middleware refreshes sessions.
        }
      },
    },
  })
}

export interface WorkQueueRow {
  property_id: string
  owner_name: string | null
  owner_class: string
  cash_amount_cents: string | null
  naupa_property_type: string | null
  holder_name: string | null
  last_known_city: string | null
  last_known_state: string | null
  year_reported: number | null
  enforceable_on: string | null
  priority_reason: string
  expected_value_cents: string
  gross_fee_cents: string
  expected_cost_cents: string
  p_contactable: string
  p_signs: string
  p_entitlement_provable: string
  confidence: string
  rationale: string[]
  params_version: string
  scored_at: string
}
