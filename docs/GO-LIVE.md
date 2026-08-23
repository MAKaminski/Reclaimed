# Go-live checklist

Current state: **all seven phases built, kill switch `unregistered`, nothing can
send.** 294 tests, 7 E2E, 7 CI gates green.

Two tracks run in parallel. The **registration track is the long pole** (4–8
weeks) and starts with a step that costs nothing — do that first, today.

---

## ⚠ Track A — Registration. Start with step 0.

### 00. Make one phone call first — it is free and it de-risks the build

**GA DOR Office of General Counsel, (404) 417-2225** — the contact printed on Policy
Bulletin ADMIN-2025-03.

Ask precisely:

> *"Will the Unclaimed Property Section accept a UP-CDR2 that is e-signed by the
> claimant and notarised by a Florida-commissioned remote online notary, submitted
> as a PDF to `ucp.cdr.claims@dor.ga.gov`?"*

**Why this is above the screening step:** it costs nothing, it takes ten minutes, and
the answer decides the shape of the entire signature and submission pipeline. Rule
560-1-1-.14 was amended effective 26 March 2025 to accept out-of-state remote
notarisation, and UP-CDR2 Rev. 04/09/2025 invokes it by name — the regulatory chain
is clean (BUILD-SPEC §6.3). What is unknown is whether the Unclaimed Property
Section, an operational unit, has internalised a rule change from March 2025.

Under § 44-12-220(g) a rejected claim does not delay revenue; it hands the property
to whoever files a complete claim next. Building a same-day digital pipeline on an
unconfirmed reading is the expensive way to find out.

Ask these on the same call — they are DOR-QUESTIONS 6, 13 and 14:

- [ ] Does the claimant's own physical location matter, or only the notary's
      commissioning state?
- [ ] Will DOR confirm a **specific named e-signature product** satisfies
      560-1-1-.14(1)(a)? (No published allow-list was found, so there is no safe
      harbour today.)
- [ ] Does the § 44-12-220(i) heir affidavit still require notarisation? SB 403
      waives the probate *order*; it does not obviously waive the notary. If it also
      permits an unnotarised affidavit, the sub-$7,500 decedent claim becomes the
      highest-margin segment we have — it removes the largest software cost and the
      KBA failure risk in one stroke.
- [ ] Get the answer **in writing**, then record it in `docs/DOR-QUESTIONS.md` and
      only then consider `ENABLE_RON_SIGNATURE`.

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
- [ ] **Redeploy.** ⚠ The public pages are statically generated, so offer state is
      baked at build time. Changing the env var alone leaves the live site saying
      "not registered, not accepting clients" indefinitely. This is safe in one
      direction only — a stale build *understates*, never overstates — but it does
      mean the marketing site does not flip until a build runs.
- [ ] Confirm `/registration-status` shows the new number and that `/` now renders
      the § 44-12-239(f) legend instead of the pre-registration disclosure
- [ ] `pnpm verify:legend` green before the first solicitation. If the attestation
      has drifted while registration is active, `getOfferState()` returns
      `unavailable`, the site noindexes itself, and nothing may be sent

### 3a. The public site, before it is worth having

- [ ] `NEXT_PUBLIC_SITE_URL` set in Vercel to the real apex domain
      (its host is brand-checked at module load — a domain containing a denied
      term refuses to render the public tree at all)
- [ ] Verify the domain in Google Search Console and submit `/sitemap.xml`
- [ ] Confirm `/robots.txt`, `/sitemap.xml` and `/llms.txt` all serve **anonymously**
      in production — the proxy matcher behaves differently there than in dev
- [ ] Only after registration: decide whether to add a contact route. There is
      deliberately no form, no email capture and no waitlist today —
      § 44-12-239.2(a)(10). `docs/DECISIONS.md` ADR-0010 has the reasoning

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

### Staff access — built

Magic-link sign-in, no password: this system holds owner PII from the
§ 44-12-239.1(a) file, and a password is one more credential to phish or leak.

**Access is granted in advance by an admin, never self-service.** An address that
has not been invited cannot even create an account (`shouldCreateUser: false`),
and an account with no `staff` row is a real signed-in user who sees nothing.

The first admin is created by CLI, deliberately — a *route* that grants
administrator access is a race the attacker wins by arriving first:

```bash
pnpm bootstrap:admin --email you@example.com --name "Your Name" \
    --designated-agent --cleared-at 2026-08-01
```

`--designated-agent` marks you as named to DOR under § 44-12-239. **The database
refuses the designation without a clearance date** — ticking that box unscreened
IS the § 44-12-239(d) failure, and it is entity-fatal. Omit both flags until your
PBSA check is back.

After that, invite staff from `/staff`. Every invitation and every change to who
may act writes an audit row citing § 44-12-239(d).

⚠ Requires `DATABASE_URL`, and Supabase email delivery configured (the built-in
sender is rate-limited; wire your own SMTP before onboarding a team).

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
