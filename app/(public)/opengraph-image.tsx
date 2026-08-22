import { ImageResponse } from 'next/og'
import { getOfferState } from '@/lib/compliance/offerState'
import { SITE_NAME } from '@/lib/public/site'

export const alt = 'Reclaimed — Georgia unclaimed property'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * An OG card is envelope copy: it is what appears in a shared link with NO
 * surrounding disclosure. So it must never imply an available service while we
 * are unregistered — hence the status strap, which is derived, not written.
 *
 * Typographic only, using the built-in font. Shipping a woff would mean adding
 * the first binary asset to a repo that deliberately has no public/ directory.
 */
export default function OpengraphImage() {
  const offer = getOfferState()
  const registered = offer.state === 'offering'

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', background: '#fafaf9', color: '#1c1917',
        padding: '72px', fontFamily: 'sans-serif',
      }}>
        <div style={{ display: 'flex', fontSize: 34, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#78716c' }}>
          {SITE_NAME}
        </div>
        <div style={{ display: 'flex', fontSize: 68, lineHeight: 1.15, maxWidth: '900px' }}>
          Georgia unclaimed property claims that are not simple
        </div>
        <div style={{
          display: 'flex', fontSize: 28, color: registered ? '#14532d' : '#7f1d1d',
          borderTop: '2px solid #e7e5e4', paddingTop: '28px',
        }}>
          {registered
            ? 'Registered claimant’s designated representative · Georgia'
            : 'Not currently registered · Not offering services'}
        </div>
      </div>
    ),
    size,
  )
}
