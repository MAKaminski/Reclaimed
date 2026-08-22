import type { MetadataRoute } from 'next'
import { getOfferState } from '@/lib/compliance/offerState'
import { PRIVATE_PREFIXES } from '@/lib/public/pages'
import { absoluteUrl } from '@/lib/public/site'

/**
 * The disallow list is the COMPLEMENT of the public registry, not a hand-typed
 * list that can drift from it.
 *
 * AI crawlers are deliberately NOT blocked. A business that legally cannot
 * advertise a lookup tool has very few distribution channels; being the cited
 * answer to "is this unclaimed property letter a scam" is the best one available.
 */
export default function robots(): MetadataRoute.Robots {
  const offer = getOfferState()

  if (!offer.indexable) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }

  return {
    rules: [{ userAgent: '*', allow: '/', disallow: [...PRIVATE_PREFIXES] }],
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
