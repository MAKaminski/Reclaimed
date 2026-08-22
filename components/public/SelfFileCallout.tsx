import { DOR_CLAIM_PORTAL } from '@/lib/public/site'

/**
 * "You may not need us."
 *
 * build-spec §12 requires that when a claimant's situation is simple enough to
 * file directly, the product SAYS SO — "as an actual code path, not an
 * aspiration." `templates/outbound/firstTouchLetter.tsx` already implements
 * that branch for the mailed letter. This is the same thing for the web.
 *
 * It is also, not coincidentally, the strongest SEO asset on the site: "how do
 * I claim unclaimed property in Georgia" is the query people actually type, and
 * the honest answer is the one worth ranking for.
 */
export function SelfFileCallout({ heading = 'Most people should do this themselves' }: { heading?: string }) {
  return (
    <aside data-self-file-callout="true" className="notice notice--ok" style={{ margin: '1.5rem 0' }}>
      <p style={{ margin: '0 0 0.4rem', fontWeight: 700 }}>{heading}</p>
      <p style={{ margin: 0 }}>
        If you can prove you are the owner — the name matches, the address matches,
        and nobody has died or dissolved — filing with the Georgia Department of
        Revenue takes an afternoon and costs nothing. No representative is required,
        and a representative cannot make the Department pay you faster.
      </p>
      <p style={{ margin: '0.5rem 0 0' }}>
        <a href={DOR_CLAIM_PORTAL} rel="noopener"><strong>Start a free claim at gaclaims.unclaimedproperty.com →</strong></a>
      </p>
    </aside>
  )
}
