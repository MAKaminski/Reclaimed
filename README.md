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

## Gates

```bash
pnpm verify:all       # every CI compliance gate
pnpm test:compliance  # one named test per §1 guardrail, statute in the test name
pnpm test             # units, incl. 20k-case fee-cap property tests
pnpm typecheck
pnpm build
```

| Gate | Enforces |
| --- | --- |
| `verify:no-payments` | §1.1 — no payment SDK, no charge construction (§ 44-12-239.2(a)(12)) |
| `verify:templates` | §1.2 — every outbound template carries the legend (§ 44-12-239(f)) |
| `verify:legend` | §1.2 — the legend still matches the enrolled SB 103 act, byte for byte |
| `verify:forms` | §6.2 — a DOR form revision breaks the build instead of voiding claims (§ 44-12-224(b)) |

## State of play

The kill switch defaults to `unregistered`. Nothing sends, nothing generates an
agreement, and no DOR data is accepted until registration completes — see
`docs/RUNBOOK.md`. **The build is not the gate. Registration is.**

All seven phases are built:

| Phase | What exists |
| --- | --- |
| 0 Compliance | Rules engine, `computeFee`, byte-verified legend, brandGuard, kill switch, blocked hosts |
| 1 Ingest | Format-sniffing parser, staging + server-side diff, `disappeared` halt. 1 GB in 13s |
| 2 Scoring | EV model with versioned, documented priors and logged inputs; EV-ranked queue |
| 3 Locate | Evidence-gated authority chain (min-confidence), § 44-12-220(i) heir path |
| 4 Agreements | UP-CDR2 generation from the real DOR PDF, golden-file tested |
| 5 Outreach | One send gate, cross-channel permanent suppression, mail-first |
| 6 Claims | Email submission with idempotency, 90/60-day clocks, expected receipts |
| 7 Verification | Five CI gates, 234 unit/compliance tests, 7 E2E |

**Supabase:** project `reclaimed` (us-east-1), 15 migrations applied, RLS
deny-all verified end to end. Set `DATABASE_URL` from the dashboard before
running `pnpm ingest` — the >1GB weekly file is COPY-loaded over a direct
connection, not through the REST API.

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
- Build against **UP-1061** — it is still published by DOR but recites the
  repealed 24-month / 10% regime.
