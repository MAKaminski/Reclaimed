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
