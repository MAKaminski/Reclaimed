# Build Prompt — Georgia Unclaimed Property CDR Platform ("v1")

> **How to use this file.** Paste the whole thing into Claude Code as the opening
> message of a fresh repo. It is written to be executed top-to-bottom. Section 1
> is non-negotiable and must be re-read before any commit that touches money,
> agreements, or outbound messaging. Sections 8+ are the phased build order.
>
> Companion file: `state-rules.seed.json` — the machine-readable compliance seed.
> Load it verbatim; do not let the model re-derive these numbers from memory.

---

## 0. What we are building

A platform that lets a **registered Georgia Claimant's Designated Representative
(CDR)** systematically find high-value unclaimed property held by the Georgia
Department of Revenue, identify and reach the person legally able to sign for it,
generate the state-mandated recovery agreement, and track the claim to payment.

We are the CDR. The owner is the claimant. The Georgia DOR pays both of us
directly, in one transaction, sixty days after approval.

**The economics, stated plainly so you can sanity-check every feature against them:**

| Input | Value | Source |
| --- | --- | --- |
| GA unclaimed property on hand | ~$3.3B | Gov. Kemp SB 403 signing, May 2026 |
| Statutory fee cap (Recovery Agreement) | **30%** of the claimed amount or the property's value, **whichever is lower** | O.C.G.A. § 44-12-224(d)(1) |
| Fee cap (Purchase Agreement) | **none** | § 44-12-224(d)(1)(B) |
| Properties per Recovery Agreement | **15 max** | Form UP-CDR2 |
| Properties per Purchase Agreement | **5 max** | Form UP-CDR4 |
| Registration cost | **$1,200**, 4-year term, $1,200 renewal | § 44-12-239(a), (h) |
| Payment timing | within **60 days** of approval, to **both** parties | § 44-12-220(d)(3) |
| Decision window | **90 days** | § 44-12-220(b) |
| Payment method | electronic or check, **first offset against unpaid GA tax liability** | § 44-12-220(c)(2) (SB 403) |

A $4,000 claim at 30% is $1,200 — one claim pays the registration. This is a
**high-value-claim-selection business, not a volume business.** Every ranking,
filter, and queue you build should optimize for expected dollars recovered per
hour of human work, never for record count.

---

## 1. NON-NEGOTIABLE GUARDRAILS

These are statutory. Violating any of them risks an administrative fine of up to
**$2,000 PER ACT (§ 44-12-239.2(b)(5))**, registration revocation with a bar on
reapplying, a prohibition on being a director, officer, agent, employee, or
≥10% ultimate equitable owner of a CDR employer, and referral to the Georgia
Attorney General — all under O.C.G.A. § 44-12-239.2.

Encode each one as a **runtime-enforced invariant with a test**, not a comment.

### 1.1 NO ADVANCE FEES. EVER.
> § 44-12-239.2(a)(12): "Receipt or **solicitation** of consideration to be paid
> in advance of the approval of a claim under this article."

This kills the originally-conceived pricing. Specifically **banned in Georgia**:
- A $20/month subscription attached in any way to claim services.
- A $100-per-claim-set setup fee.
- A card on file at signup.
- A "search fee," "research fee," "document prep fee," or "postage recovery."
- Any Stripe object created before DOR approves the claim.

**The only two legal revenue mechanics in GA:**
1. **Contingency** — ≤30% under a UP-CDR2 Recovery Agreement, paid by DOR directly to the CDR at claim approval.
2. **Purchase** — buy the property interest outright under a UP-CDR4 Purchase Agreement. No fee cap, **but proof of payment to the seller must be filed with the claim or the claim is void** (§ 44-12-224(d)(2)).

**Implementation:** there is no payments integration in v1. If you find yourself
adding Stripe, stop and re-read this section. Revenue arrives as a **paper check
from DOR mailed to the CDR's registered address**. Model it as an
`expected_receipt` record reconciled manually.

### 1.2 THE MANDATORY SOLICITATION LEGEND
> § 44-12-239(f): every solicitation to an owner or apparent owner must carry, in
> **all capital letters, in at least 12-point type OR in a font larger than the
> font used in the solicitation, whichever is larger**:

```
THIS IS A SOLICITATION. THIS IS NOT A BILL OR OFFICIAL GOVERNMENT DOCUMENT AND
HAS NOT BEEN SENT BY THE STATE OF GEORGIA. YOU ARE NOT REQUIRED TO USE THE
SERVICES OFFERED IN THIS SOLICITATION.
```

Note the **"whichever is larger"** clause. If body copy is 14pt, the legend must
be **larger than 14pt**, not 12pt. This is a *computed* value, not a constant.

**Byte-verify the string before shipping it.** Justia and similar publishers are
behind Cloudflare and resist verbatim retrieval; a single wrong word makes the
compliance notice non-compliant. Check it against Lexis GA Code or the enrolled
SB 103 (2023) act text, store it as a single exported constant with a
`verifiedAgainst` comment, and add a test asserting the byte length.

**Implementation:**
- A single `<SolicitationLegend>` component and a matching PDF/print primitive.
- It takes the document's maximum body font size and emits `max(12, bodyMax + 1)`.
- **A lint rule and a test that fails the build** if any template under
  `templates/outbound/**` renders without the legend. No exceptions for
  "internal preview" — previews get it too, so it can never be forgotten.
- Applies to every channel: direct mail, email, SMS, landing pages, PDFs.

### 1.3 NAME AND BRAND RESTRICTION
> § 44-12-239(g): may not register under or use a business name that might lead a
> reasonable person to conclude the representative is an agent of the United
> States or of a state, agency, or political subdivision.

**Implementation:** a `brandGuard` module with a denylist applied to entity name,
DBA, domains, email From-names, and mail envelope copy. Seed the denylist with:
`georgia, state of, bureau, division, department, official, agency, treasury,
revenue, federal, national, commission, authority, gov, .gov`. Fail CI if any
configured brand string matches. Ship a documented override that requires a
written justification field — so a deliberate choice is recorded, not silent.

### 1.4 NO SOLICITATION BEFORE REGISTRATION
> § 44-12-239.2(a)(10) reaches "entering into, **or making a solicitation to
> enter into**, an agreement to file a claim … unless such person is registered."

You may **build** before registering. You may not **send** before registering.

**Implementation:** a global kill switch `CDR_REGISTRATION_STATUS` with values
`unregistered | pending | active | suspended | revoked`, plus
`CDR_REGISTRATION_NUMBER` and `CDR_REGISTRATION_EXPIRES_AT`. Every outbound send
path and every agreement-generation path hard-fails unless status is `active`
and the expiry is in the future. Default the env var to `unregistered` so a
fresh clone cannot send. Surface the status in the app header.

### 1.5 THE FEE CAP IS COMPUTED, NOT TYPED
> § 44-12-224(d)(1): total fees **and costs** may not exceed 30% of the claimed
> amount **or** the property's value, **whichever is lower**. Over-cap agreements
> are reduced to 30% and DOR remits the net directly to the claimant.

"Fees **and costs**" is the trap. Postage, notary fees, skip-trace spend,
document retrieval — all of it counts inside the 30%.

**Implementation:** `computeFee({ claimedAmount, propertyValue, costs })` returns
`{ feePct, feeDollars, netToClaimant, capBasis, capBinding }`. It must:
- take `min(claimedAmount, propertyValue)` as the basis;
- add `costs` to the fee before testing the cap;
- clamp and set `capBinding: true` rather than throwing;
- refuse to produce an agreement where `feePct > stateRules.GA.feeCapPct`.

Property-tax it with a table test, including the null-value case: where the
holder did not report a value, § 44-12-224(c)(3) requires the agreement to state
a **percentage of net value** instead of a dollar figure (form UP-CDR2 Path B,
where `B1 + B2 must equal 100`).

### 1.6 THE 120-DAY UNENFORCEABILITY WINDOW
> SB 403 (eff. 2026-07-01) → § 44-12-220(d.1)(4): agreements entered into on or
> after 2026-07-01 **"and reported and delivered to the commissioner under this
> article"** shall be unenforceable for **120 days** after the date of payment or
> the delivery of property to the commissioner.

**The trigger date is ambiguous and DOR has published no construction.** Read most
naturally it runs from the *holder's* remittance to DOR, making it a cooling-off
on newly-reported property, not aged inventory.

**Implementation:** store `date_delivered_to_state` per property (available in
the CDR bulk file as *year reported* — see §5 on the precision problem). Compute
`enforceable_on = date_delivered_to_state + 120 days`. **Where the date is
unknown or only year-precise, resolve conservatively** — treat the property as
inside the window until proven otherwise. Add a `TODO(DOR-CONFIRM-120)` marker
and a settings toggle so the interpretation can be corrected in one place once
DOR answers in writing.

### 1.7 NO SCRAPING OF gaclaims.unclaimedproperty.com
The public search site is behind a **server-side-enforced Google reCAPTCHA v2**.
It has no robots.txt and no published terms, but the CAPTCHA is an explicit
technical access control — defeating it creates CFAA and state computer-crime
exposure and would be fatal to the § 44-12-239(d) fitness standard.

**You do not need it.** Georgia *statutorily guarantees* registered CDRs a full
database. See §5.

**Implementation:** add `gaclaims.unclaimedproperty.com` and
`ecorp.sos.ga.gov` to a `BLOCKED_HOSTS` list enforced in the HTTP client layer,
with a test. Any scraper code in this repo targeting those hosts is a defect.

### 1.8 DATA USE IS SOLICITATION-ONLY
> § 44-12-239.1(b): a CDR receiving the database "is prohibited from distributing
> such information **except for the purpose of soliciting owners of unclaimed
> property to offer claim services**." Violations referred to the Attorney General.

This forecloses an entire monetization path. **No** data resale, **no** B2B
lookup API, **no** enrichment-as-a-service, **no** public "search your name"
tool built on the CDR file, **no** sharing with partners.

**Implementation:** no public read endpoints over `properties`. Supabase RLS
denies anon by default. Every export path writes an `data_egress_log` row with
actor, row count, and stated purpose. A CI check fails on any new route under
`app/api/**` that reads `properties` without an authenticated staff session.

### 1.9 NEVER TAKE CUSTODY OF CLAIMANT FUNDS
Georgia is unusual and generous here: § 44-12-220 has DOR pay **both** the
claimant and the CDR directly, each to their own registered address, within 60
days. That means no escrow, no trust account, no money-transmitter question, and
no UCC § 3-420 conversion risk — **as long as you never redirect the claimant's
check.**

Every criminal prosecution in this industry involved exactly that redirect
(Mass. AG v. Stayman, arraigned Nov 2025, $1.1M; Ill. v. Michaud; DOJ Nevada;
DOJ N.D. Ga. — the last one specifically forged POAs for *business* owners).

**Implementation:** the claimant address field on UP-CDR2 §III is
`claimant_mailing_address` and it is **write-locked to the address the claimant
supplied on the signed agreement**. Any change requires a re-signed agreement.
Log every attempted mutation. Never allow a CDR-controlled address, PO box, or
mail-forwarding service in that field — validate against a denylist of known
CDR/company addresses and flag PO boxes for manual review.

### 1.10 OUTBOUND CHANNEL POLICY
**Direct mail is the primary channel. Do not build an autodialer or SMS blast.**

Cold-calling owners who have no prior express written consent is the largest
uncapped liability in this model — TCPA statutory damages are $500/violation,
trebled to $1,500 for willful, and it is the classic class-action vector.
Georgia folded its state no-call list into the federal registry, so the federal
DNC scrub is the Georgia scrub.

**Implementation:**
- Channels enum: `mail` (enabled), `email` (enabled, CAN-SPAM compliant),
  `phone` (manual-dial only, feature-flagged off), `sms` (not implemented).
- Federal DNC scrub required before any phone channel activates.
- Calling window hard-limited 8am–8pm recipient local time.
- CAN-SPAM: valid physical postal address, functioning one-click opt-out honored
  within 10 business days, no deceptive subject lines, clear ad identification.
- Cross-channel suppression: an opt-out on any channel suppresses **all** channels
  for that person. One `suppressions` table, checked by every sender.

### 1.11 THE PI-LICENSE OPEN QUESTION
O.C.G.A. § 43-38-3(3) defines "private detective business" to include obtaining
information about "the location, disposition, or recovery of **lost** property"
and about a person's "assets … whereabouts." **There is no public-records
exemption in § 43-38-14.** There is a real argument that § 44-12-239 — later and
specific — governs instead, and DOR's own materials never mention a PI license.

**This is unresolved.** The risk sharpens the moment you skip-trace living owners
beyond matching DOR's own file.

**Implementation:** put skip-trace behind a feature flag
`ENABLE_EXTERNAL_SKIPTRACE`, default **off**, with a startup warning citing this
section. Phase 1 must work using only the DOR file's own last-known-address data
plus public business-registry data. Get a Georgia opinion letter before flipping it.

---

## 2. What changed from the original concept, and why

Record this in `docs/DECISIONS.md` as ADR-0001 so it is not silently re-litigated.

| Original | Status | Replacement |
| --- | --- | --- |
| $20/mo subscription | ❌ Illegal in GA — § 44-12-239.2(a)(12) | None. No subscription product. |
| $100 per claim set | ❌ Illegal in GA — same | None. |
| 30% contingency | ✅ **Legal in GA**, at the statutory ceiling | Keep. Computed and clamped, incl. costs. |
| "We obtain it, keep 30%, disburse 70%" | ⚠️ Right outcome, wrong mechanism | DOR pays both parties directly. We never touch the owner's money. |
| Fully digital, SaaS-style delegation | ⚠️ Blocked today | Forms UP-CDR2/CDR4 require **notary acknowledgment**; Georgia has no RON (HB 289 died 2026-04-02). v1 is e-sign + notary, wet-ink fallback. See §6. |
| Scrape websites for highest-$ property | ✅ Right instinct, wrong source | Ingest the statutorily-guaranteed weekly CDR bulk file. Better data, zero legal risk. |
| $500 floor, store everything below | ✅ **Now structurally correct** | SB 403 has DOR auto-paying sole-owner cash ≤$500 with no claim filed at all (§ 44-12-220(d.1)(1)). The sub-$500 tier self-liquidates. Store it, never work it. |

---

## 3. Tech stack

Match the existing launch stack. Do not introduce alternatives without an ADR.

- **Next.js (App Router) + TypeScript**, deployed on **Vercel**
- **Supabase** (Postgres + Auth + Storage + RLS) as the system of record
- **PostHog** for product analytics
- **Stripe: NOT in v1** — see §1.1. Do not install the SDK.
- Ingest jobs: Node scripts run from a scheduled Vercel cron or a local CLI;
  the >1GB weekly file is too large for a serverless function, so the ingest CLI
  is a first-class `pnpm` script designed to run on a workstation or a container.
- PDF generation: `pdf-lib` for filling and stamping; the DOR forms are the
  authoritative layout and must not be re-typeset (see §6.2).
- Tests: Vitest for units, Playwright for the two critical E2E paths.

Repo layout:

```
/app                    Next.js routes (staff-only; no public data surface)
/lib
  /compliance           fee math, legend, brandGuard, window calcs — pure fns
  /ingest               bulk-file parser, differ, loader
  /scoring              expected-value model
  /locate               entity resolution + authority chain
  /forms                UP-CDR2/3/4 generation
/db/migrations          Supabase SQL
/data/seed              state-rules.seed.json, NAUPA code tables
/scripts                CLI entrypoints
/docs                   DECISIONS.md, DOR-QUESTIONS.md, RUNBOOK.md
/tests
```

---

## 4. The compliance rules engine

**Rules are data, not code.** Load `data/seed/state-rules.seed.json` into a
`state_rules` table on migrate. Georgia is fully populated; other states are
present but flagged `status: "unverified"` and are **blocked from all workflows**
until a human clears them.

Every rule row carries a `citation` and a `verified_at`. Any rule with
`status !== "verified"` must throw when a workflow touches it — a loud failure,
never a silent default. Write the test for that first.

Fields (see the seed file for the full shape):
`feeCapPct`, `feeCapAbsolute`, `capBasis`, `costsCountTowardCap`,
`purchaseAgreementExemptFromCap`, `unenforceabilityDays`,
`unenforceabilityAnchor`, `maxPropertiesPerRecoveryAgreement`,
`maxPropertiesPerPurchaseAgreement`, `requiresNotary`, `ronAvailable`,
`ownerMustSignPersonally`, `poaHonored`, `advanceFeesPermitted`,
`mandatedForms[]`, `solicitationLegend`, `registrationRequired`,
`registrationFee`, `registrationTermYears`, `dataAccessMode`,
`dataRedistributionPermitted`, `payeeModel`, `conflictingClaimRule`.

---

## 5. Data ingestion

### 5.1 The source
**O.C.G.A. § 44-12-239.1(a)** obligates the commissioner to provide every
registered CDR with "a downloadable or deliverable, **searchable and sortable
data base for all unclaimed accounts**." Fields — each qualified **"if provided by the holder,"** and cash amount
qualified **"if applicable"** (§ 44-12-239.1(a)). The file is guaranteed to
exist; it is *not* guaranteed complete per field. Your parser must treat every
one of these as nullable:

1. Apparent owner name (and insured/beneficiary for insurance property)
2. Last known address
3. NAUPA owner-account relation code
4. **Amount of cash** ← this is the exact dollar figure; the $500 filter lives here
5. Unliquidated securities: share count, issuer name, CUSIP
6. Safe-deposit contents descriptions (NAUPA-style)
7. NAUPA property-type description
8. **Date of last activity**
9. **Year property was reported**
10. Holder name and contact information

Plus a **Property ID** as the first field (per DOR's Program Overview) — this is
the join key and it is exactly what form UP-CDR2 §I requires.

Delivery: **>1GB delimited text, refreshed weekly**, emailed to the registration's
primary contact. DOR states explicitly that it "cannot offer any assistance in
using this database."

### 5.2 Unknowns to resolve before finalizing the parser
DOR disclaims support, so the loader must be defensive. Put these in
`docs/DOR-QUESTIONS.md` and design around not knowing:
- Delimiter, encoding, header row present or absent, quoting/escaping rules
- One flat file or several; transport (SFTP vs. HTTPS link vs. attachment)
- Whether `date of last activity` is a full date or year-precise
- Whether "year reported" is the holder's report year or DOR's receipt year
  (**this determines the 120-day window anchor — see §1.6**)

**Build the parser to sniff:** detect delimiter by frequency analysis across the
first 100 lines, detect header by type-inference on row 1 vs. rows 2–50, detect
encoding via BOM then heuristic. Emit a `ingest_manifest` row recording every
inference so a wrong guess is visible rather than corrupting the table.

### 5.3 Load strategy
Weekly **full refresh with diffing**, not incremental polling.

- Stage into `properties_staging` (unlogged table, `COPY`-loaded).
- Diff against `properties` on `property_id`.
- Emit `property_events` rows: `appeared | value_changed | disappeared`.
  **`disappeared` is the highest-signal event in the system** — it usually means
  the property was claimed, so it must immediately halt any in-flight outreach or
  agreement for that property.
- Never hard-delete. Set `retired_at` and keep history.
- Target: parse and load 1GB in under 10 minutes on a laptop. Stream, don't buffer.

### 5.4 Store everything, work a subset
Per the original spec: **ingest 100% of rows, including sub-$500.** The
`workable` determination is a computed view, not a filter at ingest.

`is_workable` requires all of:
- `cash_amount >= 500` **OR** the property is non-cash (securities, safe-deposit
  contents) with an estimable value **OR** value is null and the property type
  suggests material value
- `enforceable_on <= now()` (the §1.6 window has run)
- `retired_at IS NULL`
- not already under an active agreement by us
- not suppressed

**And a second tier — `is_priority`** — for the categories SB 403's ≤$500
auto-pay provision cannot reach, because those are now Georgia's real
addressable market:
- multi-owner property (auto-pay requires a **sole** owner)
- business-entity-owned property (auto-pay requires a **natural person**)
- deceased owners / heir claims (see §7.4 — the ≤$7,500 affidavit path)
- securities and safe-deposit contents (auto-pay requires **cash**)
- any cash property > $500 (above the auto-pay ceiling)

---

## 6. Agreement generation and signature

### 6.1 The forms are mandatory and using the wrong one voids the claim
> § 44-12-224(b): "the failure of a claimant's designated representative to use
> such agreement or agreements as required by this subsection **shall void the
> claimant's designated representative's claim**." (It voids *our* claim, not the
> claimant's own right to the property — but it is still total loss to us.)

| Form | Purpose | Cap | Property limit | Notary |
| --- | --- | --- | --- | --- |
| **UP-CDR1** | CDR registration | — | — | — |
| **UP-CDR2** | Standard Recovery Agreement (contingency) | 30% | **15** | **Yes** |
| **UP-CDR3** | Agreement Addendum (custom terms) | — | — | No |
| **UP-CDR4** | Purchase Agreement (buy outright) | **none** | **5** | **Yes** |

**UP-1061 (Power of Attorney) is a trap.** It is still published on DOR's FAQ
page at Rev. 10/21 and recites the **repealed** 24-month / 10% regime verbatim.
It is a POA for *discussing* a claim, not a substitute for CDR2/CDR4. **Do not
build against it.** Add it to a `KNOWN_STALE_ARTIFACTS` list with this note.

### 6.2 Generation rules
- Fill the **actual DOR PDFs**; never re-typeset them. Download the current
  revisions at build time, hash them, and **fail CI if a hash changes** — DOR
  revised UP-CDR2 on 2025-04-09 and will do so again.
- **UP-CDR3 auto-attaches** whenever custom terms exist **AND** total known value
  exceeds $2,000 (§ 44-12-224(g)(1)). Custom terms without a duly executed
  addendum are **void** (§ 44-12-224(g)(3)). Terms must be ≥10-point font and
  positioned *after* the published form's terms.
- **At or below $2,000, custom terms may not be added at all.** The $2,000
  threshold is permission to add terms, not merely a trigger for the addendum.
  Enforce it as a hard block, not a warning.
- Enforce the 15/5 property limits at agreement-build time. "No property may be
  added to the form after it has been received" — so the property set is
  immutable once sent; changes require a new agreement.
- Path A vs Path B on UP-CDR2 §II is determined by whether the holder reported a
  value. Path B requires `B1 + B2 == 100`. Test both.
- Every field on §IV (CDR block) is populated from config, including the
  **CDR Identification Number** issued by DOR at registration. Refuse to generate
  if that number is absent.

### 6.3 The notary problem — be honest about this in the UI
The statute does not require notarization; **the forms do.** UP-CDR2 §VI:
> "This Recovery Agreement must be acknowledged by the Claimant before a notary
> public. … *Where remote notarization is allowed by law*, an electronic
> signature is acceptable provided that it complies with Rule 560-1-1-.14(1)(a)."

> **CORRECTED 2026-08-23.** The paragraph that stood here described Rule
> 560-1-1-.14 as "the narrow attorney-supervised COVID-era model — the notary must
> be a Georgia-licensed attorney (or supervised by one) and physically in
> Georgia." **That was the rule before 26 March 2025 and is no longer current
> law.** The amendment was filed 6 Mar 2025 and took effect 26 Mar 2025. Anyone
> planning against the old text would have built the wrong signature pipeline.

Georgia has **not** enacted a general remote online notarization statute of its
own — HB 289 died when the 2026 session adjourned on 2026-04-02. **It does not
matter**, because DOR defers to the notary's commissioning state.

Rule 560-1-1-.14 as amended defines "Remote Notarization" as a notarization
"performed remotely in compliance with the laws of a state which permits remote
notarization by the notary publics of that state," and § (3)(a) provides that the
Department "will accept remote notarizations from notary publics in states where
remote notarization is permitted by law on documents that require a notary and are
authorized by the Commissioner through Department regulations, publications,
policy bulletins, or other documents accepted as Department guidance."

Verified against a clean reproduction of the rule on 2026-08-23: **no requirement
that the notary be a Georgia-licensed attorney, no requirement that the notary be
in Georgia, and no clause limiting the rule to particular tax types.** So a
Florida-commissioned RON notary serving a Georgia signer produces an acceptable
notarization.

**The chain closes on our own form.** UP-CDR2 is the "other documents accepted as
Department guidance" the rule requires, and Rev. 04/09/2025 — issued two weeks
after the amendment — invokes 560-1-1-.14(1)(a) by name. That revision is the one
already pinned in `data/seed/form-hashes.json`; its bytes were read directly on
2026-08-23 and carry the clause verbatim. DOR Policy Bulletin **ADMIN-2025-03**
(2025-05-28) restates the position and binds DOR personnel.

**And it is still UNVERIFIED for UP-CDR2/CDR4 operationally, which is why
`ENABLE_RON_SIGNATURE` remains false.** The regulatory reading is clean; whether
the Unclaimed Property Section — an operational unit that may not have
internalised a March 2025 rule change — has actually accepted a RON-notarised
UP-CDR2 is a different question, and nobody has published an answer. Under
§ 44-12-220(g) a rejected claim does not merely delay revenue, it hands the
property to whoever files a complete claim next. This remains the single
highest-value question to put to DOR in writing, and it now costs one phone call
rather than a research project.

### 6.3a Knowledge-based authentication will fail on our exact population

Remote notarization statutes require dynamic knowledge-based authentication —
typically five out-of-wallet questions drawn from credit-header data, 80% correct,
one retry. It fails legitimate users at a material rate: thin credit files, recent
movers, frozen credit, and people who have not opened a credit line in decades.

**That list is a description of our customer.** A dormant-property owner is by
definition someone with no recent financial event at their address of record, and
estate claimants skew elderly. The population most likely to hold a large unclaimed
balance is the population most likely to fail KBA.

Consequences to build for, not to discover:

- A **dispatched mobile notary fallback** (~$50–150 all-in) is a day-one path, not
  a contingency. Without it a KBA failure is a dead claim rather than a slower one.
- **Instrument the failure rate from the first claim.** Above roughly 15% it
  dominates cycle time on its own and invalidates any throughput estimate.
- The fallback is also the answer for a signer who simply will not use video.

### 6.3b The notary's commissioning state is a single point of failure

The whole same-day thesis depends on the RON notary being commissioned in a state
that permits RON **and** permits its notaries to serve signers located elsewhere.
Florida is the conventional choice for exactly that reason.

Get it in writing from the vendor before integrating. If an on-demand pool routes
a signer to a notary in a state that restricts signer location, the notarization
is defective and § 44-12-224(b) voids the claim — after the work is done. Verify
too that the filled PDF and the platform's tamper-evident seal compose cleanly,
since 560-1-1-.14(1)(a) requires the signature be tamper-proof and
non-transferable. That is a build-time integration risk rather than a legal one,
and it is cheap to test with one real claim before any volume.

Note the attribution carefully, because it matters for which document you cite in
an argument with DOR: **the forms themselves point to DOR Rule 560-1-1-.14(1)(a)**,
not to the policy bulletin. The bulletin is what accepts out-of-state remote
notarization; the rule is what governs whether your e-signature qualifies.

Neither names a vendor. Rule 560-1-1-.14 and ADMIN-2025-03 set *functional*
criteria — intent to sign, and tamper-evidence binding the signature to *that*
document — and ADMIN-2025-03 lists four accepted forms (typed name in or attached
to the document, scanned handwritten signature, signature pad, stylus on a
display). No published allow-list of approved products was found; treat that as an
argument from absence, not a DOR statement, and therefore as **no safe harbor**. A
rejected signature **voids the claim** under § 44-12-224(b).

**Implementation — build all three paths behind one flag `SIGNATURE_MODE`:**

| Mode | Status | Build order |
| --- | --- | --- |
| `wet_ink` | ✅ Known-good | **v1 default.** Generate print-ready PDF + prepaid return envelope + notary instructions. |
| `esign_ron_out_of_state` | ⚠️ Unverified | Build the integration, ship it disabled, enable on written DOR confirmation. |
| `esign_ga_attorney_notary` | ⚠️ Narrow | Operationally hard; stub only. |

Never let the UI promise a claimant a fully-online experience while
`SIGNATURE_MODE = wet_ink`. Copy must say what actually happens.

### 6.4 Submission is an email pipeline, not an API
There is **no CDR e-filing portal.** Completed claims are emailed as PDFs to
`ucp.cdr.claims@dor.ga.gov` (addendums to the same; registration to
`ucp.cdr.registration@dor.ga.gov`). Model submission as an outbound email with
attachments, an idempotency key, and a stored copy of the exact bytes sent.

---

## 7. The locate pipeline

Score every workable property, then route it to the cheapest locate path that can
plausibly produce a signable authority. Two segments, one queue, ranked by
expected value.

### 7.1 The scoring model
```
expected_value = claim_value
               × P(contactable)
               × P(signs)
               × P(entitlement_provable)
               × fee_pct
               − expected_cost_to_work
```

Make every term an explicit, versioned, overridable estimate in
`lib/scoring/params.ts`, and **log the inputs on every score** so the model can be
back-tested against actual outcomes once claims start closing. Do not bury
priors in the code. Start with deliberately crude values and improve them from
observed conversion — a documented guess that gets corrected beats a
sophisticated one nobody can audit.

### 7.2 Entity resolution
Two owner classes, detected from the owner-name string plus the NAUPA relation code:

**Individuals** — resolve against the DOR file's own last-known address first.
That data is free, statutorily provided, and carries no PI-license question.
Only escalate to a paid vendor when `expected_value` justifies it *and*
`ENABLE_EXTERNAL_SKIPTRACE` is on (§1.11).

**Business entities** — this is the differentiator. DOR's published business-claim
requirements are remarkably thin ("an authorization letter authorizing the
claimant to contract with the CDR" plus "a copy of the claimant's work ID card")
and **completely silent on dissolved and merged entities.** Nobody has published a
playbook for that gap, which is exactly why it is worth owning.

Source: **Georgia SOS bulk corporations data**, $1,000 one-time or $100 setup +
$500/month, tab-delimited, from the Office of Data Innovations
(`odi@gta.georgia.gov`, 404-463-2300). **Do not scrape `ecorp.sos.ga.gov`** — it
is behind a Cloudflare managed challenge and is on the §1.7 blocklist.

⚠️ **Verify before purchase** whether the bulk file actually contains officer and
registered-agent fields or only entity-level records. The product page does not
enumerate the layout. This determines whether officer matching is one pass or two.

### 7.3 The authority chain — build this defensively
Every prosecution in this industry involved forged authority for business owners.
Treat the authority chain as the most safety-critical subsystem in the codebase.

Model `authority_chain` as an ordered, evidence-backed sequence:
`property.owner_name → entity_match (SOS) → entity_status → authorized_signer →
evidence_documents[] → signed_agreement`

Rules:
- **Every link requires an uploaded evidence document.** No link may be asserted
  by staff without one. Store in Supabase Storage with an immutable audit row.
- `entity_status` ∈ `active | admin_dissolved | terminated | merged | withdrawn`.
  Anything other than `active` sets `requires_manual_review = true` and blocks
  auto-progression.
- A confidence score per link; the chain's score is the **minimum**, not the mean.
  One weak link is a weak chain.
- Below a configurable threshold, the claim cannot be submitted — only escalated
  to a named human reviewer, recorded by name.
- Log every state transition immutably. If a regulator ever asks how you
  established authority on a given claim, the answer must be one query.

### 7.4 Heir claims — a genuine new opening
SB 403's new § 44-12-220(i): heir claims aggregating **≤ $7,500** no longer need
probate. An affidavit signed by **all** heirs, stating amicable division and that
funeral, last-illness, and lawful claims are paid, with the will attached if
testate — provided no Georgia probate proceeding is pending or was ever filed.
Recipients are personally liable to estate creditors up to the value received.

This removes the main cost driver on small estate claims. Build an
`heir_affidavit` workflow: all-heir enumeration, a completeness gate that refuses
to proceed on a partial heir set, the ≤$7,500 aggregate check, and the
no-probate attestation.

Related: a **registered CDR** can obtain certified copies of a decedent's will,
codicil, or trust instrument on presenting evidence of death — an
entitlement-documentation channel unique to CDRs. Build it into the evidence
collection step.

### 7.5 The conflicting-claims rule is a strategy input
> § 44-12-220(g): first **complete** claim wins. Same day, claimant beats CDR.
> Same day, buyer beats claimant or CDR. Buyer vs buyer → earliest executed
> agreement. **CDR vs CDR → lowest fee wins**; tie → earliest executed agreement.

Two consequences to encode:
1. **"Complete" means entitlement established**, not "submitted." A fast
   incomplete filing loses to a slower complete one. Optimize the evidence step,
   not the submit button.
2. **Fee level is literally determinative against a competing CDR.** Make
   `fee_pct` a per-claim strategic variable with a documented floor, not a global
   constant pinned at 30%.

### 7.6 The outreach channel is mail, and that is a constraint not a preference

**Cold calling is a solicitation, and Georgia has already said so in capitals.**
§ 44-12-239(f) requires every CDR solicitation to carry "THIS IS A SOLICITATION" —
the State has characterised the conduct, so "we are only informing them" is not
available as a theory. The Telemarketing Sales Rule reaches any campaign conducted
to induce the purchase of services, and a 30% recovery fee is a service.

The compliant lane is narrow and cheap: **manual dial only, DNC-scrubbed within 31
days, and no texting at all.** The registry is roughly $82 per area code with the
first five free — about $410 a year for Georgia's ten. The established-business-
relationship exception does not help: it needs a purchase within 18 months or an
inquiry within three, and a cold prospect is neither. Owners scatter nationwide, so
Florida's, Washington's and Oklahoma's mini-TCPA statutes come with them —
Oklahoma caps three calls per 24 hours *even with consent*, at $500 a violation
trebled for wilful.

**Mail is therefore the channel, and the postage class is a data decision.** Send
First-Class with *Return Service Requested*, not Marketing Mail. Marketing Mail is
about 26 cents cheaper and is neither forwarded nor returned — with decades-stale
addresses, forwarding and return are the entire point. A returned piece comes back
carrying the new address from the USPS change-of-address file. Budget the
difference as enrichment, not postage: the bounces are the best address data in
the pipeline.

One sequencing trap worth naming: **run address hygiene AFTER skip tracing, never
before.** Change-of-address data covers filed moves in roughly the last 18–48
months, so running it against a 1987 address returns essentially nothing. Its value
is on the current addresses a skip trace returns.

---

## 8. Data model

Write the migrations first, then the code. Sketch:

```
state_rules              seeded from JSON; GA verified, rest blocked
properties               the DOR file, all rows, incl. sub-$500
property_events          appeared | value_changed | disappeared
ingest_runs              manifest, inferred format, row counts, checksums
owners                   resolved persons and entities
entities                 SOS-matched businesses + status
authority_links          ordered chain, each with evidence + confidence
evidence_documents       storage refs, immutable audit
outreach_campaigns       channel, template version, legend attestation
outreach_sends           per-recipient, per-channel, with suppression check
suppressions             cross-channel, permanent
agreements               form type, version, fee math snapshot, signature mode
claims                   DOR submission, status, 90-day and 60-day clocks
expected_receipts        anticipated DOR check, reconciliation
audit_log                append-only, every compliance-relevant action
data_egress_log          every export, actor, purpose
```

Notes:
- `agreements` stores a **frozen snapshot** of the fee computation, the rules
  version, and the form hash. If the law or the form changes, historical
  agreements must still render exactly as signed.
- All timestamps `timestamptz`. All money in **integer cents**. No floats
  anywhere near a fee calculation.
- RLS on by default, deny-all, with explicit staff-role grants.

---

## 9. Build phases

Do not proceed to the next phase until the previous phase's acceptance tests pass.

**Phase 0 — Compliance skeleton.** No product features. The rules engine, the
seed loader, `computeFee`, the legend component, `brandGuard`, the registration
kill switch, `BLOCKED_HOSTS`, and the CI checks that enforce §1. *This phase is
the point of the project. Do it first and do it properly.*

**Phase 1 — Ingest.** The defensive parser, staging + diff, `property_events`,
the `is_workable` and `is_priority` views. Acceptance: parse a 1GB synthetic
fixture in <10 min, correctly detect a deliberately unusual delimiter, and emit
correct events across three simulated weekly deltas including a disappearance.

**Phase 2 — Scoring and queue.** Expected-value model, staff work queue ranked by
EV, with score inputs visible on every row.

**Phase 3 — Locate.** Entity resolution, SOS matching, the authority chain with
evidence gating and minimum-confidence scoring. Skip-trace stubbed behind the
flag.

**Phase 4 — Agreements.** UP-CDR2/3/4 generation from the real PDFs, fee snapshot,
15/5 limits, Path A/B, addendum auto-attach, `wet_ink` output with notary
instructions.

**Phase 5 — Outreach.** Mail-first campaign builder with the legend enforced,
suppression, CAN-SPAM email. Nothing sends unless `CDR_REGISTRATION_STATUS=active`.

**Phase 6 — Claims tracking.** Email submission pipeline, 90/60-day clocks,
status, expected receipts, reconciliation.

**Phase 7 — Verification.** See §10.

---

## 10. Verification requirements

Ship none of this without:

1. **A compliance test suite** with one named test per §1 guardrail, each
   referencing its statutory citation in the test name. `pnpm test:compliance`
   must be a distinct, always-green gate.
2. **Fee math property tests** — random inputs, assert `fee <= 0.30 × min(claimed,
   value)` always holds, costs included, and that Path B percentages sum to 100.
3. **A form-hash check in CI** against the live DOR PDFs, so a DOR revision breaks
   the build instead of silently producing a void claim.
4. **A golden-file test** rendering a complete UP-CDR2 from fixture data, diffed
   against a checked-in reference PDF.
5. **An adversarial review pass** before launch: give a subagent the §1 list and
   the diff, and ask it to find a path that sends an unlegended solicitation,
   generates an over-cap agreement, redirects a claimant address, or reads
   `properties` unauthenticated.
6. **`docs/DOR-QUESTIONS.md`** — the written question list for DOR, tracked to
   answers. Seeded with: out-of-state RON acceptance; the 120-day trigger date;
   dissolved/merged entity documentation; bulk file format and transport; whether
   a corporate resolution substitutes for a "work ID card."

---

## 11. Sequencing outside the code

The build is not the gate. Registration is.

1. **Screen every officer, owner, and claim-submitting employee against the
   20-year dishonesty/deceit/fraud and fiduciary-breach bar (§ 44-12-239(d))
   BEFORE spending anything.** The $1,200 is nonrefundable and a disqualification
   is entity-fatal.
2. File **UP-CDR1** + $1,200 + W-9 + GA SOS registration + PBSA-accredited
   background checks for at least one employee/agent. Budget 4–8 weeks.
3. Send DOR the §10.6 question list in the same outreach.
4. On approval, capture the **CDR Identification Number** into config — nothing
   generates without it.
5. Buy the **GA SOS bulk corporations file** ($1,000) after confirming it carries
   officer fields.
6. Get a Georgia opinion letter on the **§ 43-38 private detective** question
   before enabling external skip-trace.
7. Note the **30-day material-change notification** duty — failure is *immediate
   revocation*. Put a recurring reminder and a change-log in the runbook.

---

## 12. Tone and honesty requirements for the product itself

DOR tells every claimant, repeatedly and in bold, that they can claim for free and
are not required to use a CDR. Our own solicitation legend says the same thing in
capital letters. That is the market we chose.

So the product's value proposition has to be **entitlement complexity, not
discovery** — dissolved businesses, merged entities, heirs, multi-owner property,
securities, safe-deposit contents. The things a person genuinely cannot easily do
alone. Write the marketing copy to that, and do not build a single feature whose
value depends on the claimant not knowing they could have done it themselves.

If a claimant's situation is simple enough that they should just file with DOR
directly, **the product should tell them so.** Build that as an actual code path,
not an aspiration.
