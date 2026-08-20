/**
 * The ONLY way to stamp the § 44-12-239(f) legend onto a PDF.
 *
 * Mirrors components/SolicitationLegend.tsx. Direct mail is the primary channel,
 * so this is the path that matters most in practice.
 */

import { type PDFFont, type PDFPage, rgb } from 'pdf-lib'
import { renderLegend } from './legend'

export interface StampLegendOptions {
  page: PDFPage
  font: PDFFont
  /** Largest body font size on the document, in points. */
  maxBodyPointSize: number
  x: number
  /** Baseline of the FIRST line. Subsequent lines are drawn below it. */
  y: number
  /** Wrapping width in points. */
  maxWidth: number
  lineHeightMultiple?: number
}

export interface StampedLegend {
  pointSizePt: number
  lines: string[]
  /** Total vertical space consumed, in points. */
  heightPt: number
}

/** Greedy word wrap measured in the actual font, so nothing silently clips. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
    } else {
      if (current !== '') lines.push(current)
      current = word
    }
  }
  if (current !== '') lines.push(current)
  return lines
}

export function stampSolicitationLegend(options: StampLegendOptions): StampedLegend {
  const { page, font, maxBodyPointSize, x, y, maxWidth } = options
  const lineHeightMultiple = options.lineHeightMultiple ?? 1.25

  // Throws LegendUnverifiedError if the legend is not byte-verified.
  const legend = renderLegend(maxBodyPointSize)
  const size = legend.pointSizePt

  const lines = wrap(legend.text, font, size, maxWidth)
  const lineHeight = size * lineHeightMultiple

  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * lineHeight,
      size,
      font,
      color: rgb(0, 0, 0),
    })
  })

  return { pointSizePt: size, lines, heightPt: lines.length * lineHeight }
}
