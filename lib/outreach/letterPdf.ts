/**
 * The first-touch solicitation letter, as a print-ready PDF.
 *
 * Direct mail is the PRIMARY channel (§1.10) — it carries no TCPA exposure and
 * is what § 44-12-239(f) plainly contemplates when it specifies point sizes for
 * a printed notice. So this, not the React template, is the artifact that
 * matters.
 *
 * The legend is stamped through stampSolicitationLegend(), which computes its
 * size from the largest body font actually used here. It is not a constant:
 * § 44-12-239(f) requires 12pt OR larger than the body font, whichever is
 * larger.
 */

import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from 'pdf-lib'
import { stampSolicitationLegend } from '@/lib/compliance/legendPdf'
import { isRehearsal, REHEARSAL_WATERMARK } from '@/lib/compliance/operatingMode'
import { assertBrandCompliant } from '@/lib/compliance/brandGuard'
import { type Cents, formatUsd } from '@/lib/compliance/money'
import type { RegistrationState } from '@/lib/compliance/registration'

/** Largest font used in the body. The legend is computed from this. */
const BODY_PT = 11
const HEADING_PT = 15
const MARGIN = 64

export interface LetterInput {
  recipientName: string
  recipientAddress: string[]
  propertyId: string
  /** Null when the holder reported no value. */
  reportedValueCents: Cents | null
  holderName: string | null
  /** Why this claim is not straightforward — the actual reason to hire us. */
  complexityReason: string
  /** True when the owner could plainly file this themselves. */
  claimantCouldFileDirectly: boolean
  feePct: number
  cdrName: string
  cdrAddress: string
  cdrPhone: string
  registration?: RegistrationState
}

export interface LetterArtifact {
  pdfBytes: Uint8Array
  isRehearsal: boolean
  legendPointSize: number
  bodyMaxPointSize: number
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ')) {
      const candidate = line === '' ? word : `${line} ${word}`
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate
      else { lines.push(line); line = word }
    }
    lines.push(line)
  }
  return lines
}

export async function buildSolicitationLetter(input: LetterInput): Promise<LetterArtifact> {
  // § 44-12-239(g): the name on an envelope may not suggest a government agency.
  assertBrandCompliant({ entityName: input.cdrName, envelopeCopy: [input.cdrAddress] })

  const pdf = await PDFDocument.create()
  const page: PDFPage = pdf.addPage([612, 792])
  const body = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const width = page.getWidth()
  const maxWidth = width - MARGIN * 2
  let y = 792 - MARGIN

  const draw = (text: string, font: PDFFont, size: number, gap = 6) => {
    for (const line of wrap(text, font, size, maxWidth)) {
      page.drawText(line, { x: MARGIN, y, size, font, color: rgb(0.1, 0.1, 0.1) })
      y -= size * 1.35
    }
    y -= gap
  }

  // ── Sender block ─────────────────────────────────────────────────────────
  draw(input.cdrName, bold, BODY_PT, 0)
  draw(`${input.cdrAddress}\n${input.cdrPhone}`, body, BODY_PT, 18)

  // ── THE LEGEND, before anything persuasive ───────────────────────────────
  // § 44-12-239(f) does not specify placement, but a notice telling the reader
  // they can do this for free belongs where they will actually read it, not
  // below the fold.
  const stamped = stampSolicitationLegend({
    page, font: bold, maxBodyPointSize: BODY_PT,
    x: MARGIN, y, maxWidth,
  })
  y -= stamped.heightPt + 20

  // ── Recipient ────────────────────────────────────────────────────────────
  draw([input.recipientName, ...input.recipientAddress].join('\n'), body, BODY_PT, 18)

  const value = input.reportedValueCents === null
    ? 'an amount the holder did not report'
    : formatUsd(input.reportedValueCents)

  draw('About property held in your name by the State of Georgia', bold, HEADING_PT, 10)

  draw(
    `The Georgia Department of Revenue is holding unclaimed property recorded to ` +
    `your name under property ID ${input.propertyId}` +
    (input.holderName !== null ? `, reported by ${input.holderName}` : '') +
    `, in ${value}.`,
    body, BODY_PT, 10,
  )

  if (input.claimantCouldFileDirectly) {
    // §12: if their situation is simple, the product says so. This is a real
    // code path, not an aspiration.
    draw(
      'You can almost certainly claim this yourself, for free, and we recommend ' +
      'that you do. Contact the Georgia Department of Revenue Unclaimed Property ' +
      'Program directly. You do not need us, and we would rather tell you that ' +
      'than take a fee for work you can do in an afternoon.',
      bold, BODY_PT, 10,
    )
  } else {
    draw(
      `Claiming it is not straightforward in your case: ${input.complexityReason}. ` +
      'That is the kind of entitlement problem we handle.',
      body, BODY_PT, 10,
    )
    draw(
      'You are free to pursue this yourself at no cost, and the Department will ' +
      `help you do so. If you would rather we handled it, our fee is ${input.feePct}% ` +
      'of what is recovered, payable only if the claim is approved. There is no ' +
      'charge of any kind before then, and the Department pays you directly.',
      body, BODY_PT, 10,
    )
  }

  draw(
    'If you would like us to act for you, reply to this letter and we will send ' +
    'the Department’s Recovery Agreement for your signature.',
    body, BODY_PT, 0,
  )

  // ── Rehearsal watermark ──────────────────────────────────────────────────
  const rehearsal = isRehearsal(input.registration)
  if (rehearsal) {
    page.drawText(REHEARSAL_WATERMARK, {
      x: 40, y: 380, size: 20, font: bold,
      color: rgb(0.85, 0.1, 0.1), opacity: 0.3,
      rotate: degrees(32), maxWidth: width - 80, lineHeight: 24,
    })
  }

  return {
    pdfBytes: await pdf.save(),
    isRehearsal: rehearsal,
    legendPointSize: stamped.pointSizePt,
    bodyMaxPointSize: BODY_PT,
  }
}
