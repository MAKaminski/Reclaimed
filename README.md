# Reclaimed

Georgia unclaimed property recovery for a registered **Claimant's Designated
Representative (CDR)**.

Find high-value property held by the Georgia Department of Revenue, identify the
person legally able to sign for it, generate the state-mandated agreement, and
track the claim to payment.

## The compliance layer is the product

O.C.G.A. § 44-12-239.2 makes twelve specific acts sanctionable at up to **$2,000
per act**, with registration revocation, a bar on reapplying, a prohibition on
holding office at any CDR employer, and referral to the Attorney General.

Three of those are trivially easy to commit by accident from ordinary product
code — advance fees, an unlegended solicitation, and soliciting before
registration. So each guardrail ships as a **runtime-enforced invariant with a
named test citing its statute**, and several ship as database constraints rather
than application logic.

Read `docs/BUILD-SPEC.md` §1 before touching anything that moves money, generates
an agreement, or sends a message.

## Two surfaces

| | Public | Authenticated |
|---|---|---|
| Routes | `app/(public)` — 12 pages, prerendered static | `app/(staff)`, `app/(auth)` — dynamic |
| Who | anyone, including crawlers | staff with a `staff` row |
| Indexing | indexable | `noindex` |
| Database | **none** — importing `@/lib/db` fails CI | Supabase, RLS as the caller |

The public tree describes Georgia's unclaimed property regime and tells readers how
to claim **free, directly from the Department**. While unregistered it carries a
prominent disclosure that we are not offering services and not accepting clients,
and it offers no call to action and no contact form at all — see ADR-0010.

Staff land on **`/dashboard`**, the action board: one imperative next action, the
supply meter, five pipeline phases, oldest-in-stage, and what each compliance gate
is holding.

## Where to read next

| Document | Covers |
|---|---|
| `docs/ARCHITECTURE.md` | The two surfaces, derived state, the four enforcement layers, data flow, known debt |
| `docs/DECISIONS.md` | Ten ADRs — why the model, the gates, and the public surface are shaped this way |
| `docs/BUILD-SPEC.md` | The statutory research and the eleven §1 guardrails |
| `docs/GO-LIVE.md` | The two-track checklist: registration, then technical |
| `docs/RUNBOOK.md` | The out-of-code sequence and the 30-day material-change duty |
| `docs/DOR-QUESTIONS.md` | Open questions for the Department, each with its conservative default |
| `docs/WHAT-IT-TAKES.md` | Georgia vs the California alternative |

## Gates

```bash
pnpm verify:all       # all nine CI compliance gates
pnpm test:compliance  # one named test per §1 guardrail, statute in the test name
pnpm test             # 366 unit + compliance tests
pnpm test:e2e         # 23 Playwright tests
pnpm typecheck && pnpm build
```

| Gate | Enforces |
| --- | --- |
| `verify:no-payments` | §1.1 — no payment SDK, no charge construction (§ 44-12-239.2(a)(12)) |
| `verify:templates` | §1.2 — outbound carries the legend; the public tree carries the *inverse* rule |
| `verify:legend` | §1.2 — the legend still matches the enrolled SB 103 act, byte for byte |
| `verify:brand` | §1.3 — no brand string suggests a government agency (§ 44-12-239(g)) |
| `verify:no-public-data` | §1.8 — no unauthenticated read of CDR-derived data (§ 44-12-239.1(b)) |
| `verify:public-surface` | route architecture — only `(public)` may be indexed; registry ↔ filesystem bijective |
| `verify:migrations` | the repo's claim to reproduce the database is checkable |
| `verify:forms` | §6.2 — a DOR form revision breaks the build instead of voiding claims |

> **A static gate is decoration until a negative probe proves it fires.**
> `verify:templates` has been fooled four times by text that merely *mentions*
> what it checks — an import line, a doc comment with parentheses, a comment
> stating the rule, and a tautological marker. Every one shipped green. When you
> add an assertion, break the code deliberately and confirm the build fails.

## State of play

The kill switch defaults to `unregistered`. Nothing sends, nothing generates a
sendable agreement, and no DOR data is accepted until registration completes — see
`docs/RUNBOOK.md`. **The build is not the gate. Registration is.**

Everything else runs today in **rehearsal mode**: score, locate, generate a real
UP-CDR2 from the real DOR form, record a signature, assemble a claim packet. Only
three actions wait — posting a solicitation, posting an agreement, and emailing a
claim to DOR.

| Phase | What exists |
| --- | --- |
| 0 Compliance | Rules engine, `computeFee`, byte-verified legend, brandGuard, kill switch, blocked hosts, operating mode, offer state |
| 1 Ingest | Format-sniffing parser, staging + server-side diff, `disappeared` halt. 1 GB in 13s |
| 2 Scoring | EV model with versioned, documented priors and logged inputs; EV-ranked queue |
| 3 Locate | Evidence-gated authority chain (schema + logic; **no UI yet**), § 44-12-220(i) heir path |
| 4 Agreements | UP-CDR2 generation from the real DOR PDF, golden-file tested |
| 5 Outreach | One send gate, cross-channel permanent suppression, printable legended letter |
| 6 Claims | Email submission with idempotency, 90/60-day clocks, expected receipts |
| 7 Verification | 9 CI gates, 366 unit/compliance tests, 23 E2E |
| 8 Surfaces | Public site + SEO, the `/dashboard` action board |

**Supabase:** project `reclaimed` (us-east-1), 22 migrations applied, RLS
deny-all verified end to end. Set `DATABASE_URL` before running `pnpm ingest` —
the >1GB weekly file is COPY-loaded over a direct connection, not through REST.

## Commands

```bash
pnpm ingest --file <path> --dry-run   # validate a weekly delivery, load nothing
pnpm ingest --file <path>             # stage, diff, emit events
pnpm score                            # score the priority tier
pnpm seed:rules                       # load state rules in full
pnpm discover:fields                  # re-enumerate DOR form fields
```

## Do not

- Add Stripe, or any payments integration. Re-read `docs/DECISIONS.md` ADR-0001.
- Scrape `gaclaims.unclaimedproperty.com` or `ecorp.sos.ga.gov`. ADR-0001 §3.
- Re-type the solicitation legend anywhere. It has exactly one definition.
- Put the legend on a public page. While unregistered "THIS IS A SOLICITATION" is
  **false** there, which is its own violation — § 44-12-239.2(a)(5). ADR-0010.
- Add a contact form or waitlist before registration. § 44-12-239.2(a)(10).
- Backfill `property_workflow` to make dashboard counts look populated. It would
  permanently destroy the meaning of `entered_stage_at`.
- Add a fourth copy of the stage order. There are already three.
- Build against **UP-1061** — still published by DOR but recites the repealed
  24-month / 10% regime.
