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

---

## ADR-0008 — What the adversarial review found, and the pattern in it

**Date:** 2026-08-20 · **Status:** Accepted

Build-spec §10.5 requires an adversarial pass before launch. It was run against
the complete diff with the §1 guardrail list, and it found **three critical
bypasses and eight real fail-opens** — several in code that had been reported as
verified. Every finding was reproduced against running code, not inferred.

The individual fixes are in the commit. The **pattern** is worth recording,
because it predicts where the next defect will be.

### What held, and why

The pure-function compliance core survived a determined attack: `computeFee` and
the money layer (tried against string percentages, non-integer costs, and the
1.005 float trap), the registration kill switch, blocked-host handling including
redirect walking, the rules-status gate, and the legend byte-attestation.

These share one property: **they derive their answer from data they control.**
`computeFee` computes the cap from the basis. `getStateRules` reads a status it
owns. `isLegendVerified` hashes the constant it is checking.

### What broke, and why

Almost everything that failed depended on a **self-declared input**:

| Bypass | The declared input |
| --- | --- |
| 12pt legend against 20pt body copy | `maxBodyPointSize` prop |
| § 44-12-224(d)(2) proof-of-payment skipped | `isPurchaseAgreement: boolean` |
| Chain submittable from an absent field | `confidence`, `evidenceDocumentId` |
| Self-review passing as second-person review | `reviewStatus` without `reviewedBy` |

In each case the guard was real, well-commented, and cited the right statute —
and it validated a claim the caller made about itself. **A guard that checks an
assertion rather than the underlying fact is a comment with a type signature.**

The fixes all take the same shape: derive the fact instead. The legend size is
compared against font sizes actually present in the file; proof-of-payment keys
off the agreement form; link integrity is proven before any comparison; the
reviewer is compared to the asserter.

### Three specific lessons

**1. Fail-open is the default failure mode of numeric guards.** `Math.min` over a
missing field yields `NaN`, and `NaN < threshold` is `false`. The chain did not
merely pass — it reported *"Chain is evidenced, reviewed, contiguous, and above
threshold."* Every numeric comparison in a guard must first prove its inputs are
numbers.

**2. A CI gate can be tautological and look green forever.** The §1.8 check
listed `createClient()` as evidence of authentication — but you cannot query
Supabase without calling it, so the gate could never fire. It had passed on
every run, including a deliberate negative probe that happened to trip a
different rule. **A gate that has never failed has not been tested.** Every gate
now has a committed negative probe.

**3. The second instance of anything is where the guard is missing.** §1.9 —
the most safety-critical check in the system, the one that separates this
business from every prosecution in the enforcement history — was applied to the
claimant and not to the co-claimant. The co-claimant block is fifteen lines
below the primary one in the same function.

### Standing consequence

`scripts/verify-migrations.ts` exists because of finding 3: migrations 0009–0015
contained prose instead of DDL while commit messages said they were synced. The
database is where the claimant-address write-lock, the NOT NULL on authority
evidence, the computed legend-size CHECK, and the append-only audit rules
actually live. **A repo that cannot rebuild the database cannot rebuild the
compliance posture**, and nothing was checking that it could.

---

## ADR-0009 — § 44-12-239 subsection letters verified

**Date:** 2026-08-21 · **Status:** Accepted · **Closes an open item**

A handoff note flagged that although the legend *text* had been byte-verified,
neither **subsection letter** had been — the brief cited (f) for the solicitation
legend and (g) for the naming prohibition, and both were assumed.

That was a fair distinction and it is now closed. Both were read directly from
the enrolled SB 103 act (legis.ga.gov, 2023-2024 session), verbatim:

> **(f)** Any solicitation from a claimant's designated representative to an owner
> or apparent owner of unclaimed property shall include the following notice in
> all capital letters in at least **12 point type** or in a font larger than the
> font utilized in the solicitation, **whichever is larger**: 'THIS IS A
> SOLICITATION. …'
>
> **(g)** A claimant's designated representative may not register under or use a
> business name that might lead a reasonable person to conclude that the
> representative, firm, or employer is an agent of the United States, or an
> agency thereof, or a state or an agency or political subdivision of a state.

Three things confirmed beyond the subsection letters:

1. **The 12-point floor is statutory**, not a house convention.
   `LEGEND_MIN_POINT_SIZE = 12` is correct.
2. **"whichever is larger" is statutory language**, not our paraphrase. The
   computed `max(12, body + 1)` in `requiredLegendPointSize()` implements the
   statute rather than interpreting it.
3. The preceding subsection **(e)** confirms the material-change duty carried in
   `docs/RUNBOOK.md`: *"Failure to comply with this subsection shall result in
   immediate revocation of the registration."* Subsection **(h)** confirms the
   four-year term in the rules seed.

Method note: the enrolled act carries sequential margin line numbers which PDF
extraction interleaves into the body ("…in at**536** least 12 point type…").
Reading them out requires keeping digits and recognising the artefact — stripping
all digits, as a first pass did, also removes the "12" and would have made the
point size look unverified when it is not.

---

## ADR-0010 — The public surface, and why publishing before registration is lawful

**Status:** accepted, 2026-08-22. **Carries residual risk the owner has accepted.**

### Context

Until now there was no public surface at all: `proxy.ts` redirected every
unauthenticated request to `/signin` and the root layout set a global `noindex`.
ADR-0002 recorded that as correct — there is no public *data* surface, because
§ 44-12-239.1(b) forecloses redistributing the Department's file.

But "no public data" and "no public page" are different claims, and only the first
is required. The question is whether a page describing the service — including the
fee — may be published while unregistered.

§ 44-12-239.2(a)(10) reaches *"entering into, or making a solicitation to enter
into, an agreement to file a claim … unless such person is registered."*
**"Solicitation" is not defined anywhere in the article.**

### Decision

Publish the full service description now, behind a prominent disclosure that
Reclaimed is not registered and is not accepting clients.

**The reasoning: a communication that expressly refuses to accept an agreement
cannot be an invitation to enter one.** The disclosure is not decoration around the
offer; it is the thing that makes the page not-an-offer.

That is held mechanically rather than editorially, in four places:

1. `lib/compliance/offerState.ts` derives state from registration with no override,
   exactly as `operatingMode.ts` does. `mayInviteEngagement`, `mayCaptureContact`
   and `mayAssertOffering` are all false while unregistered.
2. `<WhenOffering>` is the only place a CTA may live, and it renders nothing before
   registration.
3. `lib/public/structuredData.ts` refuses to emit `Offer`, `Service`,
   `ProfessionalService`, or `aggregateRating` — structured data is the one place an
   offering can be asserted *invisibly*, where no copy review would catch it.
4. `verify:templates` fails the build if any form, input, submit button, server
   action, or `data-cta` in the public tree sits outside `<WhenOffering>` — and it
   holds regardless of what `CDR_REGISTRATION_STATUS` happens to be in CI, because a
   gate that only fires in one environment is not a gate.

### Three sub-decisions worth recording

**The legend is withheld, not shown.** The instinct is that over-disclosure is
always safe. It is not. The § 44-12-239(f) legend opens "THIS IS A SOLICITATION",
which on a page that expressly declines clients is **false** — and a false statement
on a commercial page is independently reachable under § 44-12-239.2(a)(5) at $2,000
per act, quite apart from the Georgia FBPA private right of action with treble
damages. So `lib/public/disclosure.ts` carries all three of the legend's
*protective* elements (not a government agency, not sent by the State of Georgia,
not required to use any service) **without asserting its premise**. CI fails if the
legend text appears anywhere in the public tree, with one exemption:
`/is-this-letter-real` quotes it educationally, and must import the constant.

**The disclosure leads with a fact, not a legal conclusion.** "THIS IS NOT A
SOLICITATION" would be us characterising our own conduct in legal terms — and if a
regulator disagreed, the disclosure itself becomes the false statement. "NOT AN
OFFER OF SERVICES. NOT ACCEPTING CLIENTS" is a fact about what we do, which we
control absolutely.

**There is a third, fail-closed offer state.** If registration goes active while the
legend attestation has drifted, `renderLegend()` throws and every public page would
500 to crawlers. We cannot fall back to `pre_registration` — we *are* registered,
and saying otherwise would be false. So `unavailable` renders identity only and
`robots.ts` returns `Disallow: /`. The site takes itself out of the index rather
than say something untrue. Same instinct as ADR-0003.

### No lead capture

Rejected, and it is the tempting one. A "notify me when you launch" form collects
the contact details of people who want claim services — the front half of soliciting
an agreement. There is no form, no input, and no email capture anywhere in the
public tree, and CI holds it.

### Consequences

- The root layout became inert, which **inverted this repo's default from noindex to
  indexable**. That is a dangerous inversion with a silent failure mode, so
  `scripts/verify-public-surface.ts` exists solely to hold the route architecture.
- `/` is now public; the staff dashboard moved to `/dashboard`.
  `tests/e2e/killSwitch.spec.ts` changed in the same commit.
- Offer state is baked at build time by static generation. **Flipping
  `CDR_REGISTRATION_STATUS` requires a redeploy** — noted in `docs/GO-LIVE.md`.

### Residual risk, stated plainly

Whether a published page that describes a service and quotes a price *while
expressly declining to accept clients* is a "solicitation to enter into an
agreement" has, so far as this research goes, **never been construed by DOR, by
rule, by bulletin, or by any reported enforcement action.** The position is
reasonable and probably right. It is untested, and it is the owner's risk.

1. **The fee quote is the weakest element on the page.** Everything else is either a
   fact about Georgia law or a statement about what we are *not* doing. "30%" is the
   one thing that reads as a price term, and a published price is classically an
   invitation to treat. The copy presents it as the *statutory cap* plus what we
   *intend* to charge once registered — never as a rate on offer.
2. **"Per act" is undefined for a continuously published page.** Per page, per day,
   per visitor? The last is implausible, but nothing forecloses it, and it is the
   unbounded tail.
3. **Georgia FBPA moves faster than DOR.** § 10-1-399 gives a private right of
   action with treble damages after only a 30-day pre-suit demand — a plaintiff's
   firm needs neither DOR to act nor us to be registered. Hence the rule that every
   factual claim on the site is substantiable from an in-repo primary source, which
   is why `/fees` renders its worked example from `computeFee()` rather than typing
   the numbers.

Also: **nothing may appear on the site that is not also true on the filed UP-CDR1.**
§ 44-12-239(c) makes false information on that form a felony under § 16-10-20.

Six questions covering this were added to `docs/DOR-QUESTIONS.md` for the UP-CDR1
package.

---

## ADR-0011 — Named-competitor comparison pages

**Status:** accepted, 2026-08-23. **Carries residual risk the owner has accepted,
on top of ADR-0010's.**

### Context

The public tree needed comparison pages for search coverage — "X vs Y" is among the
highest-intent queries in this category. The choice was between comparing
*categories* of provider and comparing *named firms*.

Naming firms is the higher-risk option and it was chosen deliberately. Two exposures
sit on it: § 44-12-239.2(a)(5) reaches a false or misleading statement at $2,000 per
act, and Georgia's Fair Business Practices Act gives a named firm a private right of
action with treble damages.

There is a second problem specific to this site. ADR-0010 holds that publishing while
unregistered is lawful because the site **expressly refuses to accept an agreement**.
A page arguing why to choose us cuts against that argument.

### Decision

Publish named comparisons, built so the ADR-0010 position is *strengthened* rather
than undermined.

1. **Every claim carries a source URL and an observation date**, non-optional in the
   type and enforced by `scripts/verify-comparison.ts`. Observations older than 190
   days fail the build — a live website changes, and a stale observation makes *our*
   page the false one.
2. **Claims are attributes, never adjectives.** "Publishes its fee: no" is something a
   reader can verify in ten seconds. "Not transparent" is a characterisation. The gate
   denylists pejoratives *and* superlatives; the second category is ours, since
   unfalsifiable puffery is itself reachable under (a)(5).
3. **Tables must be complete.** A missing row exactly where a rival does well is a lie
   by omission and the easiest one to tell by accident. "Not stated on the page
   reviewed" is the required value.
4. **We lose rows, and the gate keeps it that way.** Reclaimed is not registered;
   Reclaim Georgia LLC is and publishes CDR #202400088. That row shows them winning.
   `verify:comparison` fails the build if our own `registration_published` value stops
   saying so, with a message distinguishing "registration issued" from "the row was
   embarrassing".
5. **Every page keeps the declination banner, the standing disclosures, and the
   self-file callout.** A comparison page that still routes most readers to the free
   state route is evidence of non-solicitation, not decoration around it.

### Why this strengthens rather than weakens ADR-0010

The strongest fact about these pages is that the honest answer on most of them is
"do it yourself, free, in five minutes" — and the site says so, at the top, on every
one. A page that argues against its own commercial interest for the median reader is
poor evidence of an invitation to enter an agreement.

### Consequences

- Comparative research decays. The 190-day limit forces a re-read rather than letting
  an assertion sit; that is deliberate recurring work.
- A search-engine summary disagreed with a primary page on one firm's fee during the
  first pass. Only directly fetched sources are recorded, which is slower and is the
  only defensible method.
- We now publish observations about named third parties. If a firm changes its page,
  our page can become wrong before the staleness window closes. The mitigation is the
  window, the "as of" date rendered on every row, and the standing note that not
  publishing a rate is lawful and not required.

---

## ADR-0012 — The reference architecture, recorded and not built

**Status:** accepted as a *record of decisions*, 2026-08-23. **No vendor here is
integrated. Nothing in this ADR is a commitment to spend.**

### Context

A costed build plan arrived covering entity resolution, document extraction, identity,
PDF fill, notarisation, orchestration and mail. Recording it matters because the
reasoning decays faster than the prices, and because two of its conclusions are
architectural rather than procurement decisions.

### Decision — what to buy

| Stage | Choice | Order of magnitude |
| --- | --- | --- |
| Entity resolution | **Splink 4 on DuckDB** (MIT, UK Ministry of Justice) | free |
| Document extraction | **Extend** — per-field confidence with source citations | ~$0.06/page |
| Identity | **Stripe Identity** | ~$2/claimant |
| PDF fill | **Anvil** — fills *flat* PDFs, which is what UP-CDR2 is | ~$1.60/packet |
| Notarisation | RON vendor, negotiated | $10–25 |
| Orchestration | **Inngest** | $0 → ~$99/mo |
| Mail | **Lob**, First-Class + Return Service Requested | ~$0.72/piece |

Fully loaded, roughly **$48–49 per closed claim** including human review. That number
is what moved the workable floor from $500 to $250 in migration 0030 — break-even at
the 30% cap is a $163 claim.

### The three decisions that are not procurement

**1. Entity resolution is a margin decision disguised as a technical one.** Mail is
roughly 75% of the data budget. Splink's job is to collapse property rows into
distinct owner entities so we buy *one* skip trace and send *one* letter per person
rather than one per property. Every duplicate owner we fail to collapse is a wasted
letter. It also implements Fellegi–Sunter with term-frequency adjustment, which
scores a match on a common surname as weak evidence and a rare one as strong — on
1980s name data that is the whole game, not a nicety.

It runs as a scheduled **Python** job, not on Vercel. Accept the one polyglot boundary
with a Parquet interface on each side rather than reimplementing Fellegi–Sunter in
TypeScript. Use a model only as a tie-breaker on the ambiguous band, never as the
primary matcher — pairwise LLM matching is quadratic and impractical at this size.

**2. Extraction and sufficiency are different problems and must not share a
component.** "What does this death certificate say" is a vendor purchase at six cents
a page. "Does this satisfy Georgia's rule for this claim type at this amount" is a
legal judgment, versioned per state, and **nobody sells it**. The rules engine in
`lib/compliance/stateRules.ts` is already the right shape; point it at sufficiency,
not only fee caps. This is the moat, and it is the one line that must stay ours.

**3. Never let a model decide sufficiency.** It extracts facts; deterministic code
applies state rules. Death certificates are the highest-variance document class in
American recordkeeping — they differ by state, county and decade, and the old ones
are typewritten on coloured security paper under overlapping seals. The failure mode
of a modern model on a degraded scan is not low accuracy, it is **silent
fabrication**, and a hallucinated date of death produces no visible error: it
produces a claim rejected months later, or paid to the wrong person.

Four mitigations, all cheap: require a **source citation for every field** (a
fabricated value has nowhere to point, which is why citations beat a competitor's
higher self-reported accuracy); use the document's **internal redundancy** as a free
tripwire, since age at death must reconcile with date of birth and date of death;
**double-extract the four fields that matter** — decedent name, date of death,
certificate number, issuing jurisdiction — and route disagreement to a human; and
route review **by field confidence rather than by document**, because confirming two
uncertain fields takes forty seconds where re-reading a packet takes fifteen minutes.

Run our own bake-off on real vital records before committing. Every published
benchmark in this category is vendor-self-reported on a self-selected corpus, and
none tested vital records.

### What NOT to build

- **A claim-filing API integration.** There isn't one, anywhere. NAUPA's standardised
  format is for *holder reporting* — companies reporting property *to* states — and
  has nothing to do with filing claims. Every state is a bespoke document-and-email
  workflow, and any vendor claiming a universal claim-filing API deserves suspicion.
- **Temporal**, for this workload. It runs a worker fleet continuously, and the
  majority of our wall-clock is waiting on postal mail. Inngest bills a sleep as a
  step.
- Licensing address-hygiene or death-master data directly at four- and five-figure
  annual minimums before volume justifies it.

### Consequences

- These are decisions, not integrations. Each vendor needs an account and a key, and
  none has been created.
- Notarisation at $10–25 is **10× the entire document pipeline** and is the only line
  worth negotiating hard. Both leading vendors gate their API tier behind sales, so
  the published $25 should not be modelled as the price.
- The $48–49 figure is an estimate built from published pricing plus a loaded review
  rate. It already moved a threshold in the database, so it should be revisited
  against real cost as soon as one claim has actually closed.
