# Go-live checklist

Current state: **all seven phases built, kill switch `unregistered`, nothing can
send.** 294 tests, 7 E2E, 7 CI gates green.

Two tracks run in parallel. The **registration track is the long pole** (4–8
weeks) and starts with a step that costs nothing — do that first, today.

---

## ⚠ Track A — Registration. Start with step 0.

### 0. Screen everyone BEFORE spending a cent

**O.C.G.A. § 44-12-239(d)** disqualifies the CDR, or any **officer, owner, or
employee designated to act on its behalf**, on a conviction within **20 years**
of a misdemeanour *or* felony involving dishonesty, deceit, or fraud, or a civil
adjudication of breach of fiduciary duty.

**The $1,200 is nonrefundable and a single disqualification is entity-fatal.**
This step is free. Everything else in this document is wasted if it fails.

- [ ] Every officer screened
- [ ] Every owner screened
- [ ] Every employee who will submit or process claims screened

### 1. Entity and brand

- [ ] Entity formed and registered with the GA Secretary of State
- [ ] Brand chosen and cleared against § 44-12-239(g) — run `pnpm verify:brand`
      with `CDR_ENTITY_NAME` set. It may not suggest a government agency:
      *georgia, state of, bureau, division, department, official, agency,
      treasury, revenue, federal, national, commission, authority, gov*
- [ ] Registered mailing address decided — DOR pays the CDR here, and it is
      denylisted from every claimant address field

### 2. File UP-CDR1 → `ucp.cdr.registration@dor.ga.gov`

- [ ] UP-CDR1 form (51 fields; `data/forms/UP-CDR1.pdf`)
- [ ] $1,200 fee — 4-year term
- [ ] IRS Form W-9
- [ ] GA SOS corporate registration confirmation
- [ ] Front and back of each agent's driver's licence
- [ ] PBSA-accredited background checks for ≥1 employee/agent, emailed by the
      screener **directly** to `unclaimedpropertybackgrounds@dor.ga.gov`
- [ ] `docs/DOR-QUESTIONS.md` — send the six questions in the same outreach

⚠ False information on the registration is a **felony** under O.C.G.A.
§ 16-10-20 (§ 44-12-239(c)).

### 3. On approval

- [ ] `CDR_REGISTRATION_NUMBER` set → agreements can generate
- [ ] `CDR_REGISTRATION_EXPIRES_AT` set (registration date + 4 years)
- [ ] `CDR_REGISTRATION_STATUS=active` → **the kill switch opens**

### 4. Before enabling anything optional

- [ ] Georgia opinion letter on the **§ 43-38 private-detective** question
      before `ENABLE_EXTERNAL_SKIPTRACE`
- [ ] Written DOR answer on out-of-state RON before `ENABLE_RON_SIGNATURE`
- [ ] GA SOS bulk corporations file ($1,000, **nonrefundable**) — ⚠ confirm it
      carries **officer and registered-agent fields** before paying. The product
      page does not enumerate the layout, and the answer decides whether officer
      matching is one pass or two.

---

## Track B — Technical. Blocked on you for three things.

### Needed from you now

| Item | Where | Unblocks |
| --- | --- | --- |
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string → **Session pooler** (port 5432, *not* 6543 — `COPY` needs session scope) | End-to-end ingest, `pnpm seed:rules`, `pnpm score` |
| Brand strings | `CDR_ENTITY_NAME`, `CDR_DBA`, `CDR_DOMAINS`, `CDR_EMAIL_FROM_NAMES` | §1.3 gate, and UP-CDR1 |
| PostHog decision | ADR-0007 | Analytics, or a documented no |

### ⚠ Known gap: nobody can sign in yet

RLS is built and verified — anon is blocked at the GRANT level, non-staff sees
zero rows, staff sees its own. **But there is no sign-in page and no code path
creates a `staff` row**, so the queue renders "sign in required" for everyone,
permanently. The app is correct and not yet usable.

Needs: a sign-in route, a first-admin bootstrap, and a staff invite flow that
records `dor_designated_agent` and `background_check_cleared_at` — the two fields
that gate who may touch a claim under § 44-12-239(d).

### Testable today, without registration

- [x] 1 GB synthetic ingest, parse only — **13.1s**
- [ ] Same, loaded into Supabase end-to-end *(needs `DATABASE_URL`)*
- [x] Agreement generation from the real DOR PDF, golden-file tested
- [x] Every §1 guardrail, each with a negative probe

### Not testable until registered — and that is correct

The real bulk file is a **statutory entitlement to registered CDRs**
(§ 44-12-239.1(a)). No send, no agreement, and no claim is possible before the
kill switch opens. Phases 5 and 6 are built and structurally dead until then.

---

## First live week, once registered

1. Weekly bulk file arrives by email at the registration's primary contact
2. `pnpm ingest --file <path> --dry-run` — **always dry-run first.** DOR
   "cannot offer any assistance in using this database"; the manifest is how a
   format change is caught before it corrupts the table
3. `pnpm ingest --file <path>` — stage, diff, emit events
4. `pnpm score` → work queue ranked by expected value
5. Work the **priority tier only**: entity-owned, multi-owner, deceased/heirs,
   securities, safe-deposit, cash > $500. SB 403 auto-pay is draining everything
   else with no finder involvement

## ⚠ Standing duty from day one

**§ 44-12-239(e): failure to notify DOR of a material change within 30 days is
IMMEDIATE REVOCATION.** Entity name, address, officers, owners, designated
agents, and anything affecting the § 44-12-239(d) fitness answers. The log is in
`docs/RUNBOOK.md`.
