# Architecture Decision Records

## ADR-0001 — Three changes forced on the original commercial model

**Date:** 2026-08-20 · **Status:** Accepted

Recorded here so they are not silently re-litigated. Each is a statutory
constraint, not a product preference.

### 1. The subscription and the per-claim fee are illegal in Georgia

**Original:** $20/month subscription plus $100 per claim set.

**Why it fails:** O.C.G.A. § 44-12-239.2(a)(12) prohibits "receipt or
**solicitation** of consideration to be paid in advance of the approval of a
claim under this article." *Solicitation* is the operative word — merely offering
the subscription is the violation. This also kills any card-on-file at signup, a
"search fee", a "research fee", a "document prep fee", and "postage recovery".

**Replacement:** Contingency only (≤30% under a UP-CDR2 Recovery Agreement, paid
by DOR at approval), or outright purchase under UP-CDR4. **There is no payments
integration in v1 and there must never be one.** Revenue arrives as a paper check
from DOR, modelled as an `expected_receipt` reconciled manually.

**Enforcement:** `scripts/verify-no-payments.ts` fails CI on any payment SDK in
`package.json` or any charge-construction pattern in source.

### 2. We never touch the owner's money

**Original:** "We obtain it, keep 30%, disburse 70%."

**Why it fails:** right outcome, wrong mechanism — and the wrong mechanism is the
one that produces criminal exposure. Every prosecution in this industry involved
redirecting the owner's payment: *Commonwealth v. Stayman* (MA AG, 2025, $1.1M,
PO boxes and mail forwarding), *People v. Michaud* (IL AG, changed victims'
postal addresses), *US v. Badea & Gal*, *US v. Pendergrass & McQueen* (N.D. Ga.,
forged POAs targeting **businesses**).

**Replacement:** Georgia is unusually generous here. § 44-12-220(d)(3) has DOR pay
**both** the claimant and the CDR directly, each to their own address, within 60
days. No escrow, no trust account, no money-transmitter question, no UCC § 3-420
conversion risk — *as long as the claimant's address is never redirected.*

**Enforcement:** `claimant_mailing_address` is write-locked at the database level
to the value on the signed agreement (Phase 5). This is the single most
safety-critical field in the schema.

### 3. Scraping is unnecessary and disqualifying

**Original:** scrape the public search site for the highest-value property.

**Why it fails:** `gaclaims.unclaimedproperty.com` is behind a server-side-enforced
reCAPTCHA v2 — an explicit technical access control. Defeating it creates CFAA and
Georgia computer-crime exposure, which would be **fatal to the § 44-12-239(d)
fitness standard**: a conviction involving dishonesty or deceit bars registration
for twenty years.

**Replacement:** § 44-12-239.1(a) *statutorily obligates* the commissioner to give
every registered CDR "a downloadable or deliverable, searchable and sortable data
base for all unclaimed accounts" — >1GB, weekly, with exact cash amounts. Better
data, zero legal risk.

**Enforcement:** `lib/compliance/blockedHosts.ts` blocks the host in the HTTP
client layer, including redirects and subdomains, with tests.

---

## ADR-0002 — No public data surface

**Date:** 2026-08-20 · **Status:** Accepted

§ 44-12-239.1(b): a CDR receiving the database "is prohibited from distributing
such information **except for the purpose of soliciting owners of unclaimed
property to offer claim services**." Violations are referred to the Attorney
General.

This forecloses data resale, a B2B lookup API, enrichment-as-a-service, a public
"search your name" tool, and partner sharing. The application is staff-only:
Supabase RLS denies anon by default, and a CI check fails on any route under
`app/api/**` that reads `properties` without an authenticated staff session.

---

## ADR-0003 — The legend is byte-verified, and the system fails closed

**Date:** 2026-08-20 · **Status:** Accepted

The § 44-12-239(f) solicitation legend was flagged in the project brief as a
ship-blocker: "one wrong word makes the notice non-compliant."

It is now **byte-verified against the enrolled SB 103 (2023-2024) act text** from
legis.ga.gov — 192 bytes, sha256 `c7ec9f78…`. The enrolled act carries sequential
line numbers in its left margin which PDF extraction interleaves into the body
("…NOT A BILL OR OFFICIAL**538** GOVERNMENT DOCUMENT…"); those and PDF line breaks
were the only differences. Because the legend itself contains no digits, stripping
them cannot mask a numeric discrepancy.

The mechanism matters more than the result. `lib/compliance/legend.ts` compares
its constant against `data/seed/legend-attestation.json` on every load. **Any
drift in either direction reverts to unverified, and every outbound render path
throws `LegendUnverifiedError`.** Editing the attestation by hand to unblock a
send is the exact failure mode the file exists to prevent.
