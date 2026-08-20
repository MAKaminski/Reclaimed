/**
 * Create the FIRST administrator.
 *
 * This is a CLI script and never a web route, deliberately. A route that grants
 * administrator access — even one guarded by "only if no admin exists yet" — is
 * a race the attacker wins by arriving first, and it hands over the entire
 * § 44-12-239.1(a) file. Running this requires DATABASE_URL, which means
 * possession of the database credentials.
 *
 * Every subsequent staff member is INVITED by an existing admin through the app.
 *
 *   pnpm bootstrap:admin --email you@example.com --name "Your Name"
 *   pnpm bootstrap:admin --email you@example.com --name "Your Name" \
 *       --designated-agent --cleared-at 2026-08-01
 *
 * --designated-agent marks you as an agent designated to DOR under
 * § 44-12-239, which requires a PBSA background-check clearance date. The
 * database refuses the designation without one.
 */

import { getSql, closeSql } from '../lib/db/client.ts'

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (arg === undefined || !arg.startsWith('--')) continue
    const key = arg.replace(/^--/, '')
    const next = process.argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) { out[key] = next; i++ }
    else out[key] = 'true'
  }
  return out
}

async function main(): Promise<void> {
  const args = parseArgs()
  const email = args.email?.trim().toLowerCase()
  const fullName = args.name?.trim()
  const designatedAgent = args['designated-agent'] === 'true'
  const clearedAt = args['cleared-at']

  if (email === undefined || fullName === undefined) {
    console.error(
      'Usage: pnpm bootstrap:admin --email <email> --name "<full name>"\n' +
      '                           [--designated-agent --cleared-at YYYY-MM-DD]',
    )
    process.exit(1)
  }

  if (designatedAgent && clearedAt === undefined) {
    console.error(
      '\n✗ --designated-agent requires --cleared-at.\n\n' +
      '  § 44-12-239(d) bars anyone with a conviction in the last 20 YEARS involving\n' +
      '  dishonesty, deceit, or fraud — or a civil adjudication of breach of fiduciary\n' +
      '  duty — from acting on the CDR\'s behalf. A single bad designation is\n' +
      '  entity-fatal. Record the PBSA clearance date, or omit the designation.\n',
    )
    process.exit(1)
  }

  const sql = getSql()
  try {
    const [existingAdmin] = await sql<Array<{ email: string }>>`
      select email from staff where role = 'admin' and deactivated_at is null limit 1
    `
    if (existingAdmin !== undefined) {
      console.error(
        `\n✗ An administrator already exists (${existingAdmin.email}).\n\n` +
        '  Bootstrap is for the FIRST admin only. Invite further staff from the\n' +
        '  app so the invitation is attributed and audited.\n',
      )
      process.exit(1)
    }

    const [account] = await sql<Array<{ id: string }>>`
      select id from auth.users where email = ${email} limit 1
    `

    if (account === undefined) {
      // We do not create auth accounts here: Supabase owns identity, and a
      // hand-inserted auth row skips its own invariants. Seed an invite instead,
      // so the first sign-in redeems it exactly like everyone else's.
      await sql`
        insert into staff_invites (
          email, full_name, role, dor_designated_agent, background_check_cleared_at, invited_by
        )
        select ${email}, ${fullName}, 'admin',
               ${designatedAgent}, ${clearedAt ?? null}::timestamptz,
               coalesce((select id from staff limit 1), '00000000-0000-0000-0000-000000000000'::uuid)
        on conflict (email) do update set
          full_name = excluded.full_name, role = 'admin',
          dor_designated_agent = excluded.dor_designated_agent,
          background_check_cleared_at = excluded.background_check_cleared_at,
          revoked_at = null
      `
      console.log(
        `\n✓ Admin invite created for ${email}.\n\n` +
        '  Next: open /signin, enter that address, and follow the emailed link.\n' +
        '  The invite is redeemed on first sign-in and you become an admin.\n',
      )
      return
    }

    await sql`
      insert into staff (id, email, full_name, role, dor_designated_agent, background_check_cleared_at)
      values (${account.id}, ${email}, ${fullName}, 'admin',
              ${designatedAgent}, ${clearedAt ?? null}::timestamptz)
      on conflict (id) do update set
        role = 'admin', full_name = excluded.full_name,
        dor_designated_agent = excluded.dor_designated_agent,
        background_check_cleared_at = excluded.background_check_cleared_at,
        deactivated_at = null
    `
    console.log(`\n✓ ${email} is now an administrator.\n`)
  } finally {
    await closeSql()
  }
}

await main()
