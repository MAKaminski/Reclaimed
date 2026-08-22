import type { MetadataRoute } from 'next'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { absoluteUrl } from '@/lib/public/site'
import { getOfferState } from '@/lib/compliance/offerState'

/**
 * `lastModified` comes from the registry as a hand-maintained date string, not
 * `new Date()`. A sitemap that claims every page changed on every deploy teaches
 * crawlers that our dates carry no information.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!getOfferState().indexable) return []

  return PUBLIC_PAGES.map((p) => ({
    url: absoluteUrl(p.href),
    lastModified: p.lastModified,
  }))
}
