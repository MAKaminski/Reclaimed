# Architecture

Reclaimed is a Georgia unclaimed-property recovery platform for a registered
**Claimant's Designated Representative (CDR)**. This document is about the shape of
the system — where the boundaries are and why they are where they are. For the
statutory research see `BUILD-SPEC.md`; for individual decisions see `DECISIONS.md`.

The thesis is stated once and everything below follows from it: **the compliance
layer is the product.** O.C.G.A. § 44-12-239.2 makes twelve acts sanctionable at up
to $2,000 each, and three of them — advance fees, an unlegended solicitation, and
soliciting before registration — are trivially easy to commit by accident from
ordinary product code. So the interesting architecture is not the data flow. It is
where each invariant is enforced, and how hard it is to remove.

---

## Two surfaces

| | Public | Authenticated |
|---|---|---|
| Route group | `app/(public)` | `app/(staff)`, `app/(auth)` |
| Audience | anyone, including crawlers | staff with a `staff` row |
| Rendering | prerendered static | `force-dynamic` |
| Indexing | indexable, when offer state permits | `robots: { index: false }` |
| Database | **none — importing `@/lib/db` fails CI** | Supabase, RLS as the caller |
| Contains owner data | never | yes |

The root layout `app/layout.tsx` is **inert**: `<html><body>` and `globals.css`,
nothing more. It used to carry a global `noindex` and the `RegistrationBanner`, and
both had to move down:

- The global `noindex` would have silently suppressed the entire public tree.
- `RegistrationBanner` reads `cookies()`, which forced *every* route — including an
  anonymous crawler hit — to render dynamically and make a Supabase round trip.

Moving them inverted this repo's default from *noindex* to *indexable*, which is a
dangerous inversion with a silent failure mode: a staff route that forgets to opt
out does not throw, does not look different, and appears in no test. It just invites
Google to crawl the unclaimed property file. `scripts/verify-public-surface.ts`
exists specifically to hold that, and fails the build if any route group other than
`(public)` omits `index: false`.

### The public registry

`lib/public/pages.ts` is the single source of truth for what is public. Four
consumers derive from it: `app/sitemap.ts`, `app/llms.txt/route.ts`,
`app/robots.ts` (whose disallow list is the *complement* of the registry), and the
allowlist in `proxy.ts`.

The consequence that matters: forgetting to register a page makes it **unreachable**
— `proxy.ts` redirects it to `/signin` — rather than silently indexable. Fail-closed,
like everything else here. CI additionally asserts the registry and the filesystem
are bijective, which catches the orphan page that is indexable, missing from the
sitemap, and 302ing for crawlers only.

---

## Derived state, and the absence of overrides

Two modules govern what the system may do. Both are pure functions of registration
state, and **neither has an override, deliberately**:

| Module | Question | States |
|---|---|---|
| `lib/compliance/operatingMode.ts` | may something LEAVE the building? | `rehearsal` \| `live` |
| `lib/compliance/offerState.ts` | what may the building SAY about itself? | `pre_registration` \| `offering` \| `unavailable` |

There is no "pretend I am registered" switch anywhere in this codebase, because the
point of a gate is that it cannot be turned off by the person it constrains. Both
test suites include a case that spreads forged `state`/`override`/`forceState`
properties onto the input and asserts they are ignored.

**Rehearsal mode** is what makes the product usable before registration. Exactly
three actions wait: posting a solicitation, posting an agreement, emailing a claim.
Everything else — scoring, locating, chain building, generating a real UP-CDR2 from
the real DOR form, recording a signature, reconciling a receipt — runs today and
produces genuine artifacts, watermarked `REHEARSAL — NOT A VALID AGREEMENT`.

**Offer state** has a third value that is not a marketing state. If registration
goes active while the legend attestation has drifted, `renderLegend()` throws and
every public page would 500 to crawlers — but we cannot fall back to
`pre_registration`, because we *are* registered and saying otherwise would be a
false statement on a commercial page under § 44-12-239.2(a)(5). So `unavailable`
renders identity only and `robots.ts` returns `Disallow: /`. **The site turns itself
off rather than say something untrue.**

### Why the public page may exist before registration

A page that expressly declines to accept clients is not soliciting one. That is the
whole argument, it is recorded as ADR-0010, and it is held mechanically:
`mayInviteEngagement` is false while unregistered, `<WhenOffering>` renders nothing,
and CI fails if any CTA or form sits outside it. The position is reasonable and
**untested** — see ADR-0010's residual risk.

---

## Four enforcement layers

Every invariant sits at the *lowest* layer that can express it. Higher layers are
convenience; lower layers are what survive a rewrite of the layer above.

**1. Database constraint** — cannot be bypassed by any code path, including a
future one nobody has written yet.
`claimant_mailing_address` write-lock (§1.9, the field that separates this business
from every prosecution in the seed's enforcement history); `check (cash_amount_cents >= 0)`;
`invited_by` single-bootstrap unique index; the `workflow_stage` enum;
`log_workflow_change()` writing an immutable `audit_log` row on every transition.

**2. Row-level security** — the actual access-control boundary. Deny-all by
default; `anon` has no schema grant at all. `proxy.ts` says so in its own header:
delete that file and no unauthorised read becomes possible. Every view is
`security_invoker`.

**3. Runtime assertion** — throws with the statute in the message.
`assertMayTransmit()`, `assertRegistered()`, `assertLegendUsable()`,
`assertBrandCompliant()`, `assertMayInviteEngagement()`, `assertChannelPermitted()`.
These are called immediately before the act, not at the top of a request.

**4. CI gate** — catches the class of mistake that compiles and runs fine.
Nine of them (see `README.md`). This layer is the weakest, because a static check
over source text can be satisfied by text that merely *looks* like compliance.

> **The recurring defect, stated plainly.** `verify:templates` has now been fooled
> four times by text that merely mentions what it checks: an `import` line, a doc
> comment describing a call (parentheses and all), a comment stating a rule the file
> obeys, and a marker that was tautologically present. Every one shipped green.
> The fixes were a shared `executableSource()` comment-stripper and, more
> importantly, the discipline that **a static gate is decoration until a negative
> probe proves it fires.** Eleven such probes were run against the current gates.

---

## Data flow

```
DOR weekly bulk file (registration-gated)
  │  pnpm ingest — format sniffing, staging table, server-side diff
  ▼
properties ──► property_events (appeared | value_changed | disappeared)
  │                                          │
  │  `disappeared` is the highest-signal event: it usually means the property
  │  was claimed, so a trigger halts in-flight outreach for it. Never deleted,
  │  only `retired_at`.
  ▼
properties_workable ──► properties_priority     (views, not filters at ingest)
  │  ≥$500 cash, window run, not retired/held/suppressed/under agreement
  │  priority = the categories SB 403's ≤$500 auto-pay cannot reach
  ▼
pnpm score ──► property_scores (append-only, versioned params, inputs logged)
  │  EV = value × P(contactable) × P(signs) × P(provable) × fee − expected cost
  │  the fee term routes through computeFee(), so the queue can never promise
  │  economics an agreement would clamp
  ▼
work_queue (EV-ranked)
  │
  ├─► /queue          the ranked list, ?stage= filterable
  ├─► /property/[id]  one property, its score breakdown, its stage actions
  └─► /dashboard      the action board
        pipeline_supply  — scored but untouched  ("is my pipeline full")
        pipeline_board   — per-stage count / EV / aging
        pipeline_stuck   — oldest in stage
```

**`property_workflow` rows exist only once a human acts.** This is the single
easiest thing to get wrong when reading the schema: a fresh database with 50,000
scored properties has *zero* stage counts and a very full pipeline. Supply and
inventory are different questions, which is why `pipeline_supply` is an anti-join
rather than a stage count.

Corollary, and it is a trap: **never backfill `property_workflow` to make counts
look populated.** It would permanently destroy the meaning of `entered_stage_at`,
dating every future aging and SLA number from the backfill instead of from real work.

---

## The pipeline model

Eleven stages, three owners, grouped into five phases for the operator.

The obvious four-step framing — fill the pipeline, reach out, get it signed, file —
is wrong in one important place and two small ones:

1. Between *fill* and *reach out* sits **proving who may legally sign**, and that is
   the actual bottleneck, the actual product, and the actual moat. Three independent
   parts of this codebase already say so: BUILD-SPEC §12 ("entitlement complexity,
   not discovery"), `pEntitlementProvable` being a *multiplicative* term in the EV
   model, and `chain_submittable()` being the only per-claim qualification gate.
2. *Reach out* and *get it signed* are **one** phase — stages 4–7 are a single
   conversation with a single counterparty, and stage 6 is the waiting beat inside it.
3. *Fill the pipeline* is not a phase at all. It is a supply meter: `pnpm ingest &&
   pnpm score`, a job, not a human decision.

| Phase | Question | Stages | Status today |
|---|---|---|---|
| Find | Is there anything worth working? | 1 | workable |
| Prove | Who may legally sign? | 2–3 | **workable — MVP-1** |
| Ask | Get the signature. | 4–7 | held on registration |
| File | Get it to the Department. | 8 | held on registration + agent |
| Collect | Get paid, check the cheque. | 9–10 | DOR's clock |

`11 closed_lost` is an exit, not a phase.

**Phases are `step_number` ranges** over the rows `workflow_stage_rules()` already
returns — never a second list of stage names. A unit test asserts they cover 1–10
exactly once each.

### Known debt: stage order lives in three places

The `workflow_stage` enum (`0020`), the `values` list inside
`workflow_stage_rules()`, and the `NEXT` map in `components/StageActions.tsx`. They
agree today. Nothing enforces that they keep agreeing. Do not add a fourth.

### Held, not blocked

Gated stages are **shown at full size, in position, with their counts visible**.
The philosophy is stated in `StageActions.tsx`: *a missing button teaches nothing; a
button that explains why it refused teaches the rule.* At dashboard level that
becomes a stockpile readout — "3 properties are proved and ready to post the moment
registration lands" is the same number as "3 blocked", with the meaning the operator
actually needs. Locks are amber; red is reserved for the kill switch and real errors.

---

## What is measurable, and what is not

Exact today: standing inventory per stage, expected value, age in current stage,
untouched supply, terminal losses by reason, and the DOR-side clocks in
`claim_clocks` (`days_to_decision`, `decision_overdue`, `payment_overdue`).

**Stage-to-stage conversion is not computable.** `property_workflow` holds only the
*current* stage. The transition history exists only in `audit_log` where
`action = 'workflow_stage_change'`, with `detail->>'from'` and `detail->>'to'`.

This is deliberate at MVP-1: n is 0, and a "0% conversion" tile says nothing while
looking like bad news. Migration `0022` ships the partial index that makes a
`pipeline_transitions` view a ~15-line addition later **with no backfill**, because
the history is already being recorded correctly.

---

## Deliberate absences

Each of these is a decision, not an omission.

- **No payments integration, ever.** § 44-12-239.2(a)(12) bans receipt *or
  solicitation* of advance consideration. `verify:no-payments` fails the build if a
  payment SDK appears in `package.json`. DOR pays both parties directly; we never
  touch an owner's money, which is what keeps this out of every prosecution in the
  research.
- **No claimant login.** § 44-12-224(c)(7) requires the owner's own manual
  signature, the DOR forms require a notary, and Georgia has not enacted general RON.
  A customer portal would imply an online flow that does not legally exist.
- **No public property search.** § 44-12-239.1(b) forecloses redistributing the
  Department's file. `verify:no-public-data` enforces it, and `llms.txt` says so
  explicitly to pre-empt the obvious hallucination about a site in this category.
- **No lead capture.** Collecting contact details from people who want claim
  services is the front half of soliciting an agreement under § 44-12-239.2(a)(10).
- **No scraping.** `gaclaims.unclaimedproperty.com` and `ecorp.sos.ga.gov` are on
  `BLOCKED_HOSTS` at the HTTP client layer.
- **No SMS, no autodialer.** TCPA is $500/violation trebled to $1,500 willful and is
  the largest uncapped liability in the model. Mail carries none.
- **No authority-chain UI yet.** `authority_links`, `evidence_documents`,
  `chain_submittable()` and `heir_claims` exist in the schema and in
  `lib/locate/authorityChain.ts` but are referenced by **no file** under `app/`.
  `advanceStage()` will move a property past `chain_review` with no links recorded.
  **This is the next build**, and it needs Supabase Storage for evidence upload.

---

## Styling

`app/globals.css` defines CSS custom properties lifted from the hex literals the
staff pages were already using — nothing was invented. Public components use the
tokens; staff pages still use inline styles and are migrating.

Dark mode is scoped to `.public-shell`, **not** `:root`. Flipping the root tokens
darkened the page under the staff routes while their hand-written light-mode hex
stayed put, producing `#57534e` on `#1c1917`. A half-migrated dark mode is worse
than none.

`lib/public/typeScale.ts` caps the public type scale, and CI forbids raw `fontSize`
in the public tree. That is not stylistic tidiness: § 44-12-239(f) sizes the legend
at `max(12pt, largest font + 1)`, so **once registered, the legend is by
construction the largest text on the page.** Raising the hero raises the legend. The
tradeoff lives in one constant instead of being discovered at go-live.

---

## California data: loaded, queryable, deliberately not workable

3,433 real California rows are in `properties` with `source_key = 'CA-SCO-UPD-500'`.
**Zero of them reach `properties_workable`, and that is the correct outcome** — but
the mechanism is accidental, and the distinction matters.

`properties_workable` filters on
`enforceable_on(delivery_precision, delivered_to_state_at, year_reported) <= current_date`.
California's export carries no `year_reported` and no delivery date, so
`delivery_precision` is `unknown`, `enforceable_on()` returns NULL, and
`NULL <= current_date` is NULL rather than true. Every row is excluded.

The right answer for the wrong reason. The **deliberate** reason CA rows must not be
workable is that `states.CA.status` is `researched_not_verified_for_build`, and the
seed's own rule is that an unverified state throws rather than silently defaulting.
The 120-day window being applied at all is itself a category error: § 44-12-220(d.1)(4)
is a *Georgia* statute, and California's equivalent under Cal. Civ. Proc. Code § 1582
is a different mechanic with no fixed period.

**So do not "fix" the NULL.** Making `enforceable_on()` fall back to a default date
would unblock work on a state whose fee cap, disclosure wording and waiting period
have never been verified — which is precisely what the rules engine exists to prevent.
The correct fix, when California is worth operating in, is state-aware window logic
driven by `state_rules`, gated on that state being `verified`.

Until then California is what the plan called it: a free engineering testbed. The
parser, the multi-owner collapse, the diff, the events and the source scoping are all
exercised against real data at real scale, and nothing becomes solicitable by accident.

### Seeing them: `/holdings`

The gap in the paragraph above was not the filter — it was that no screen reported
**loaded** as distinct from **workable**. The board, the workflow and the queue all
descend from `properties_workable`, so with 3,433 real rows one table away every
staff surface still read zero, and "the load failed" and "the load succeeded and is
correctly not actionable" looked identical from the outside.

`/holdings` (migration 0025, view `acquisition_inventory`) reports holdings per
source: rows loaded, reported value, multi-owner and entity counts, the workable
count beside them, and — when workable is zero — the name of the predicate doing the
blocking. For California that is `no_delivery_date`, rendered with the warning above
rather than as a defect to be repaired.

The view is deliberately not a queue and the page deliberately has no actions on it.
`workable_blocked_by` is a diagnosis of the filter, never a licence to bypass it; the
remedy for a blocked source is verifying that state's rules in `state_rules`, which
is a research task, not a schema change.

### Why there is no per-property hyperlink

The natural request is a link from each row to that property's page on the state's
site. **For California no such page exists.** Verified 2026-08-23 by driving the real
form at `claimit.ca.gov/app/claim-search`: searching property `2113890` returned
EATON VANCE INCOME FUND BOSTON — our row exactly — and `location.href` never changed.
It is an Angular app with no addressable per-property URL. The form also carries a
`cf-turnstile-response` field, so the search sits behind Cloudflare Turnstile.

That is the same domain asymmetry `lib/acquire/challenge.ts` exists to police: the
DATA host (`claimit.ca.gov/upd-property-records/*.zip`) is unchallenged and fetchable,
while the SEARCH app on that domain is not. The acquisition layer targets the file,
never the app — which is why the loader has never met a challenge.

What survived the investigation is worth more than the link would have been: our
`property_id` **is** the state's own ID, and it round-trips against their live system.
So `/holdings` offers the ID as click-to-copy plus a link to the authority's search,
and `lib/acquire/stateLookup.ts` returns `null` rather than a guess for any source
whose lookup has not been verified this way. A wrong outbound link on a row of real
owner data is worse than no link.

### Why California cannot enter the queue, restated from the file itself

California's export has **25 columns and not one of them is a date** — no delivery
date, no year reported, no last-activity date, and no NAUPA relation code. So
`enforceable_on()` returning NULL is a property of the source, not a gap in the
column mapping, and no amount of remapping will produce the § 44-12-220(d.1)(4)
input. Making CA workable requires state-aware window logic driven by `state_rules`
and gated on CA being `verified` — research, not schema.

Two columns in that header are unmapped and genuinely useful: `NUMBER_OF_PENDING_CLAIMS`
(someone is already claiming it — a negative signal for outreach) and `NO_OF_OWNERS`.
Cross-checking the latter against the owner_count derived from row multiplicity:
**3,432 of 3,433 agree.** The one disagreement, property `10807126`, declares two
owners and ships a single owner row in a file where no sibling row exists — a defect
in California's own file, not in the multi-owner collapse.

## Authority to sign

`/property/[id]` now renders the authority chain, closing the gap where
`authority_links` and `chain_submittable()` existed in the database and zero files
under `app/` referenced them. The chain sits **above** the actions on that page,
not below: § 44-12-224(b) voids a representative's claim on a defective agreement,
so "who may legally sign" is the precondition for asking anyone to sign, not an
appendix to it.

The verdict leads with reasons rather than the confidence number, because a score
invites overriding and a named defect invites fixing. `chain_submittable()`
returns `reasons text[]` for exactly that purpose.

**The UI is read-only, and that is a schema decision rather than a scoping one.**
`authority_links.evidence_document_id` is `NOT NULL`, so a link cannot be asserted
without a document behind it; the authoring flow therefore belongs with document
upload. More pointedly, both `authority_links` and `evidence_documents` carry
`ON DELETE DO INSTEAD NOTHING` — authority evidence is **append-only**. You cannot
un-assert a link, only reject it on review, and the rejection is itself a record.

That property killed a fixture seeder mid-build. Synthetic "evidence of legal
authority" written into these tables could never be removed, which makes seeding
demo rows a one-way operation on the one table where ambiguity is least
acceptable. `pnpm probe:authority` replaced it: it builds three chains inside a
transaction, reads the verdicts back, and rolls back, then prints the row counts
to prove nothing persisted. It refuses to run outside rehearsal mode and only
touches `FIXTURE-DEMO` properties.

The three chains are chosen to produce three different verdicts, since a fixture
that only shows the happy path proves the least interesting thing:

| Property | Verdict | Why |
|---|---|---|
| PEACHTREE VENTURES, LLC | **submittable** (0.93 ≥ 0.75) | every link evidenced, reviewed, contiguous |
| ATHENS CAPITAL PARTNERS LP | blocked | entity `admin_dissolved` — DOR publishes no requirements for this case (DOR-QUESTIONS #3), so a named human must review |
| MARIETTA PROPERTIES, INC | blocked | sequence gap, an unreviewed link, and 0.41 below threshold |

### Holdings: composition, sorting, and why those three fields

`/holdings` reports three dimensions beside the counts — owner class, NAUPA property
type, and holder — served by `holdings_composition` (migration 0031). They are there
because each decides something, and the page says which rather than leaving the
reader to guess:

- **class** decides whether the *state* pays it out without us. SB 403 auto-pay under
  § 44-12-220(d.1)(1) reaches sole-owner natural-person cash only, so joint and
  entity-owned records sit structurally outside it. Georgia is draining the tier we
  cannot serve and leaving the tier we can — the class mix **is** the addressable
  market. On the California file, 723 of 3,433 records are outside auto-pay.
- **type** decides the documentary burden and whether it is cash at all. Securities
  carry a CUSIP and may already have been sold, so what arrives is proceeds rather
  than shares. Type is also the only route by which a record with no reported value
  becomes workable, through `is_material_non_cash()`.
- **holder** is leverage. One holder with hundreds of records is one documentation
  practice to learn rather than hundreds. MetLife alone reported **407 of 3,433** on
  the California file. It cuts the other way too: a dissolved or merged holder is a
  chain-of-title problem before any owner-side work begins.

Aggregation is server-side because a page showing 100 rows cannot count 3,433.

Column sorting is an **allowlist**, `SORTABLE` in `lib/db/holdings.ts`, not a
pass-through. PostgREST's `.order()` takes a column *name*, so an unvalidated
parameter lets a visitor order by any column on the table — including ones
deliberately absent from the select list. RLS still bounds what comes back, but
ordering by a column you cannot read leaks it by inference, one page at a time.

The first version used `raw in SORTABLE`, which is a bug worth remembering: `in`
walks the prototype chain, so `?sort=toString` passes the check, resolves to an entry
that does not exist, and reaches `.order(undefined)`. `Object.hasOwn` instead, pinned
by `tests/unit/holdingsSort.test.ts`.

### The board shows real records, not only fixtures

`/dashboard` reads the *workable* tier, which is correct for "what do I do next" and
useless as a picture of what we hold — a fully-loaded source contributing zero
workable rows reads identically to a failed ingest. It now carries the indexed count
beside the workable count, names the predicate holding the rest back, and lists the
highest-value **real** records with links to their property pages and to their source
in `/holdings`. They are labelled indexed-not-workable rather than blurred into the
pipeline.

A second, independent reason the queue reads low: `work_queue` INNER JOINs
`property_scores_latest`, so a newly workable property must still be scored before it
appears at all.
