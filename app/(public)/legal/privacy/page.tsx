import type { Metadata } from 'next'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd } from '@/lib/public/structuredData'

const page = PUBLIC_PAGES.find((p) => p.href === '/legal/privacy')!
export const metadata: Metadata = { title: page.title, description: page.description }

export default function PrivacyPage() {
  return (
    <div className="prose">
      <JsonLd data={[webPageLd({ page })]} />
      <h1>Privacy</h1>
      <p className="lede">
        This website has no forms, no accounts, no advertising trackers, and no
        third-party analytics. There is nothing here that collects information about
        you.
      </p>

      <h2>What these pages collect</h2>
      <p>
        Nothing you type, because there is nowhere to type. We are not registered as
        a claimant’s designated representative and therefore do not accept inquiries,
        so the site deliberately carries no contact form, no email capture, and no
        waiting list.
      </p>
      <p>
        Our hosting provider records ordinary server request logs — IP address, page
        requested, timestamp, user agent — as any web server does. We do not link
        those to any person.
      </p>

      <h2>Cookies</h2>
      <p>
        These public pages set no cookies. The staff area of this application sets a
        session cookie, which is strictly necessary for signing in and is not used
        for tracking.
      </p>

      <h2>Unclaimed property data</h2>
      <p>
        No unclaimed property data appears anywhere on this website. There is no
        search, no lookup, and no owner information published here — O.C.G.A.
        § 44-12-239.1(b) prohibits a representative from redistributing the
        Department’s file.
      </p>

      <h2>Changes</h2>
      <p>
        If we add a contact route after registration, this page will change before
        that route goes live, not after.
      </p>
    </div>
  )
}
