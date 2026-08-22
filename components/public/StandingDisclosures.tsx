import { STANDING_DISCLOSURES } from '@/lib/public/disclosure'
import { DOR_CLAIM_PORTAL } from '@/lib/public/site'

/**
 * Footer disclosures, rendered in EVERY offer state.
 *
 * These are the build-spec §12 honesty requirements and the Georgia FBPA
 * substance. The statutory legend replaces the pre-registration notice at the
 * top of the page; it does NOT replace these. They must survive registration.
 */
export function StandingDisclosures() {
  return (
    <section data-standing-disclosures="true" style={{ borderTop: '1px solid var(--rule)', paddingTop: '1.5rem' }}>
      <h2 style={{ fontSize: 'var(--fs-small)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--label)', margin: '0 0 0.75rem' }}>
        What Georgia law guarantees you
      </h2>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.5rem' }}>
        {STANDING_DISCLOSURES.map((d) => (
          <li key={d.slice(0, 40)} style={{ fontSize: 'var(--fs-small)', color: 'var(--muted)' }}>{d}</li>
        ))}
      </ul>
      <p className="source-line">
        Claim directly from the Georgia Department of Revenue, free:{' '}
        <a href={DOR_CLAIM_PORTAL} rel="noopener">{DOR_CLAIM_PORTAL.replace('https://', '')}</a>
      </p>
    </section>
  )
}
