/**
 * JSON-LD builders — offer-state aware.
 *
 * This is the FOURTH enforcement point for the same derived state, after the
 * banner, the CTA slot, and the CI gate. It matters because structured data is
 * the one place a service offering can be asserted INVISIBLY: a `schema.org/Offer`
 * in a <script> tag is a machine-readable claim that we are open for business,
 * and no human reviewing the page copy would ever see it.
 *
 * Forbidden before registration: Service, Offer, AggregateOffer,
 * PriceSpecification, LocalBusiness, ProfessionalService, LegalService,
 * aggregateRating, review. Every one asserts an available offering.
 *
 * Note there is deliberately NO WebSite.potentialAction/SearchAction. We have no
 * site search, and claiming one gestures at exactly the public lookup tool that
 * § 44-12-239.1(b) forecloses.
 */

import { getOfferState } from '@/lib/compliance/offerState'
import {
  SITE_MISSION, SITE_MISSION_LONG, SITE_NAME, SITE_POSTAL_ADDRESS, SITE_URL, absoluteUrl,
} from './site'
import type { PublicPage } from './pages'

const OFFER_IMPLYING_TYPES = [
  'Service', 'Offer', 'AggregateOffer', 'PriceSpecification', 'LocalBusiness',
  'ProfessionalService', 'LegalService', 'aggregateRating', 'review',
] as const

export class ForbiddenSchemaTypeError extends Error {
  constructor(type: string, reason: string) {
    super(
      `REFUSING TO EMIT schema.org "${type}": ${reason}\n\n` +
        'Structured data asserting an available service is a machine-readable ' +
        'solicitation. O.C.G.A. § 44-12-239.2(a)(10).',
    )
    this.name = 'ForbiddenSchemaTypeError'
  }
}

/** Gate every builder output through this. */
export function assertSchemaPermitted(node: Record<string, unknown>): Record<string, unknown> {
  const offer = getOfferState()
  if (offer.mayAssertOffering) return node

  const serialised = JSON.stringify(node)
  for (const type of OFFER_IMPLYING_TYPES) {
    if (new RegExp(`"(@type|${type})"\\s*:\\s*"?${type}`).test(serialised)) {
      throw new ForbiddenSchemaTypeError(type, offer.reason)
    }
  }
  return node
}

export function organizationLd(): Record<string, unknown> {
  return assertSchemaPermitted({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': absoluteUrl('/#organization'),
    name: SITE_NAME,
    url: SITE_URL.toString(),
    // Single-sourced from lib/public/site.ts. A mission statement that exists in
    // three places becomes three slightly different mission statements, and this
    // is the copy a machine reads.
    description: SITE_MISSION_LONG,
    slogan: SITE_MISSION,
    address: { '@type': 'PostalAddress', ...SITE_POSTAL_ADDRESS },
    areaServed: { '@type': 'State', name: 'Georgia' },
    knowsAbout: [
      'unclaimed property',
      'O.C.G.A. § 44-12-239',
      'claimant’s designated representative',
      'Georgia Disposition of Unclaimed Property Act',
      'escheat',
    ],
  })
}

export function webSiteLd(): Record<string, unknown> {
  return assertSchemaPermitted({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': absoluteUrl('/#website'),
    name: SITE_NAME,
    url: SITE_URL.toString(),
    publisher: { '@id': absoluteUrl('/#organization') },
    inLanguage: 'en-US',
    // No potentialAction. See the header note.
  })
}

export interface ArticleLdInput {
  page: PublicPage
  citations?: readonly string[]
  about?: readonly string[]
}

export function webPageLd({ page, citations = [], about = [] }: ArticleLdInput): Record<string, unknown> {
  return assertSchemaPermitted({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': absoluteUrl(`${page.href}#webpage`),
    url: absoluteUrl(page.href),
    name: page.title,
    description: page.description,
    dateModified: page.lastModified,
    isPartOf: { '@id': absoluteUrl('/#website') },
    publisher: { '@id': absoluteUrl('/#organization') },
    ...(about.length > 0 ? { about: about.map((a) => ({ '@type': 'Thing', name: a })) } : {}),
    ...(citations.length > 0 ? { citation: citations } : {}),
  })
}

export interface Faq { question: string; answer: string }

export function faqLd(faqs: readonly Faq[]): Record<string, unknown> {
  return assertSchemaPermitted({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  })
}

export interface HowToStep { name: string; text: string; url?: string }

export function howToLd(name: string, steps: readonly HowToStep[]): Record<string, unknown> {
  return assertSchemaPermitted({
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    // Describes filing with the DEPARTMENT, at no cost — not buying from us.
    estimatedCost: { '@type': 'MonetaryAmount', currency: 'USD', value: '0' },
    step: steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
      ...(s.url !== undefined ? { url: s.url } : {}),
    })),
  })
}

export function breadcrumbLd(trail: readonly { name: string; href: string }[]): Record<string, unknown> {
  return assertSchemaPermitted({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: absoluteUrl(t.href),
    })),
  })
}
