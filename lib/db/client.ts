/**
 * Direct Postgres connection for the ingest CLI.
 *
 * The weekly DOR file is >1GB (§ 44-12-239.1(a)). That is far beyond what the
 * REST API can absorb in a reasonable window, so bulk loading goes through
 * COPY on a direct connection. Everything else in the app uses supabase-js
 * with RLS.
 *
 * DATABASE_URL comes from the Supabase dashboard → Project Settings → Database
 * → Connection string. Use the SESSION pooler (port 5432) rather than the
 * transaction pooler: COPY needs a session-scoped connection.
 */

import postgres from 'postgres'

export type Sql = ReturnType<typeof postgres>

let cached: Sql | null = null

export function getSql(): Sql {
  if (cached !== null) return cached

  const url = process.env.DATABASE_URL
  if (url === undefined || url === '') {
    throw new Error(
      'DATABASE_URL is not set.\n\n' +
        '  The >1GB weekly bulk file is COPY-loaded over a direct connection, not\n' +
        '  through the REST API. Get the string from the Supabase dashboard:\n' +
        '    Project Settings → Database → Connection string → Session pooler\n' +
        '  and put it in .env.local as DATABASE_URL.',
    )
  }

  cached = postgres(url, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 30,
    // Supabase terminates TLS at the pooler with its own CA.
    ssl: 'require',
    // The pooler runs in transaction mode for some endpoints; prepared
    // statements do not survive that.
    prepare: false,
    onnotice: () => {},
  })
  return cached
}

export async function closeSql(): Promise<void> {
  if (cached !== null) {
    await cached.end({ timeout: 5 })
    cached = null
  }
}
