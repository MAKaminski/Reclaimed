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

---

## ADR-0004 — Conservatism belongs in the gate, not the ranking

**Date:** 2026-08-20 · **Status:** Accepted

This codebase resolves genuinely-unknown facts conservatively: the 120-day
window treats an unknown delivery date as *inside* the window, and the authority
chain refuses to submit a claim it cannot evidence. Both are correct, because
both gate an **action with legal consequences**.

Ranking is different, and conflating the two was a real bug.

The scoring model originally treated `entityStatus: 'unknown'` — meaning *we
have not run the SOS match yet* — as though the entity were dissolved, applying
the penalty twice: once to contactability, once to provability. The effect was
to bury every entity-owned property beneath individual ones, before Phase 3 had
looked up a single entity. But entity-owned property is, per SB 403, precisely
the addressable market.

**Decision:** split the states. `unchecked` (not yet looked up) uses a blended
prior weighted toward active, because most registered entities are in good
standing. `unknown` (looked up, indeterminate) stays pessimistic. The
conservatism lives in `chain_submittable()`, which is the thing that can
actually cause harm.

## ADR-0005 — Cost is staged by when it is incurred

**Date:** 2026-08-20 · **Status:** Accepted

The expected-value model originally scaled the entire cost of working a property
by `P(contactable)`. That produced a perverse result caught by a test: on a small
claim, a *more* reachable owner scored *worse*, because the model assumed we
would do the full evidence assembly on someone who never replied.

**Decision:** cost is decomposed by the stage at which it is actually spent —
first-touch mail unconditionally, follow-ups on contact, notary reimbursement and
evidence assembly only on signing. The expected cost weights each stage by the
probability of reaching it.

This also matters for the cap: § 44-12-224(d)(1) counts costs *inside* the 30%,
so the **full** cost is what goes to `computeFee`, while the **staged** cost is
what goes into the EV. Those are different numbers and conflating them either
overstates EV or understates the cap basis.

## ADR-0006 — The DOR forms are fully fillable; no coordinate stamping

**Date:** 2026-08-20 · **Status:** Accepted · **Supersedes a planning assumption**

Planning assumed UP-CDR2 exposed only ~14 AcroForm fields — too few for a form
whose §I alone lists 15 properties — and therefore that generation would need a
hybrid of named-field filling and coordinate stamping.

That was wrong, and the cause is worth recording: the estimate came from a raw
`strings` scan of the PDF, which cannot see inside compressed object streams.
`pdf-lib` decompresses properly and finds **63** fields on UP-CDR2, 42 on
UP-CDR4, 51 on UP-CDR1, 13 on UP-CDR3.

The property tables are physically bounded by the forms: UP-CDR2 has exactly 15
rows, UP-CDR4 exactly 5 — matching the statutory limits, which cannot be
overfilled.

**Decision:** fill named AcroForm fields only. No coordinate stamping anywhere.

**The mapping was confirmed by rendering the page, not inferred.** The §II fields
are named `fill_2` … `fill_12`, which say nothing about which is the fee
percentage and which is the net to claimant. Guessing from coordinates would have
been plausible and possibly wrong, and § 44-12-224(b) voids the claim on a
defective agreement. Page 6 was rendered and the printed labels read directly.

Two defects were caught the same way and would not have been caught otherwise:
the form prints its own `$`, so amounts rendered as `$ $63,825.50`; and the fee
had to be shown to land at exactly 30% *with costs inside it*, not on top.

## ADR-0007 — PostHog deferred pending an explicit decision

**Date:** 2026-08-20 · **Status:** Open — needs the owner's decision

The build spec lists PostHog in the tech stack (§3), but no phase requires it and
it is **not installed**. That is a deliberate hold, not an oversight.

The concern is § 44-12-239.1(b): a CDR receiving the statutory database "is
prohibited from distributing such information **except for the purpose of
soliciting owners of unclaimed property to offer claim services**," with
violations referred to the Attorney General.

Product analytics on a staff-only tool is not obviously a problem — it observes
staff behaviour, not owners. The problem is what leaks into event properties. A
single `posthog.capture('property_viewed', { ownerName, cashAmount })` sends
CDR-file-derived owner data to a third-party processor, and that is a
distribution the statute does not permit. It is exactly the kind of thing that
gets added later by someone debugging a funnel.

**Options:**

1. **Do not install it.** Zero risk. Lose staff-usage analytics on a tool with a
   handful of users, where the value is low anyway.
2. **Install it with a hard guard** — an allowlist of event properties enforced
   by a CI check, plus `person_profiles: 'never'`, so no owner-derived field can
   be captured even by accident.
3. **Self-host it**, keeping the data inside our own boundary.

**Recommendation: (1) for now, (2) if analytics become genuinely needed.** The
addressable question is "which claims convert", and that is answered from
`property_scores` and `claims` in our own database — which is where the
back-testing loop for `lib/scoring/params.ts` already points. A third-party pipe
adds statutory exposure without answering a question we cannot already answer.
