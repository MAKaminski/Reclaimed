/**
 * The printable solicitation letter for one property.
 *
 * Generating and downloading transmits nothing, so this runs in rehearsal. The
 * PDF is watermarked when unregistered — a rehearsal letter posted by mistake
 * would still be an unregistered solicitation.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/db/supabase'
import { getSessionState } from '@/lib/db/auth'
import { buildSolicitationLetter } from '@/lib/outreach/letterPdf'
import { cents } from '@/lib/compliance/money'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { staff } = await getSessionState()
  if (staff === null) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('properties_priority')
    .select('*')
    .eq('property_id', id)
    .maybeSingle()

  if (data === null) return new NextResponse('Not found', { status: 404 })
  const p = data as Record<string, unknown>

  const artifact = await buildSolicitationLetter({
    recipientName: (p.owner_name as string) ?? 'Apparent owner',
    recipientAddress: [
      p.last_known_address_line1 as string,
      [p.last_known_city, p.last_known_state, p.last_known_postal].filter(Boolean).join(', '),
    ].filter(Boolean) as string[],
    propertyId: id,
    reportedValueCents: p.cash_amount_cents === null ? null : cents(Number(p.cash_amount_cents)),
    holderName: (p.holder_name as string) ?? null,
    complexityReason: complexityFor(p.priority_reason as string),
    claimantCouldFileDirectly: p.priority_reason === 'cash_above_autopay_ceiling',
    feePct: 30,
    cdrName: process.env.CDR_ENTITY_NAME ?? 'Reclaimed Holdings LLC',
    cdrAddress: process.env.CDR_MAILING_ADDRESS ?? '900 Recovery Way, Decatur, GA 30030',
    cdrPhone: process.env.CDR_PHONE ?? '(404) 555-0199',
  })

  return new NextResponse(Buffer.from(artifact.pdfBytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="solicitation-${id}.pdf"`,
    },
  })
}

/** §12: the stated reason must be the real one, or the letter is deceptive. */
function complexityFor(tier: string): string {
  switch (tier) {
    case 'entity_owned':
      return 'the owner is a business entity, so the Department needs proof of who may act for it'
    case 'multi_owner':
      return 'the property has more than one owner, and every one of them must sign'
    case 'securities':
      return 'the property is securities rather than cash, which the Department handles differently'
    case 'safe_deposit':
      return 'the property is the contents of a safe deposit box, which cannot be paid out as cash'
    default:
      return 'the Department requires documentation establishing your entitlement'
  }
}
