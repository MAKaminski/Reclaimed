# Runbook — the out-of-code sequence

**The build is not the gate. Registration is.**

Nothing in this repository can send, generate an agreement, or receive DOR data
until `CDR_REGISTRATION_STATUS=active` with a valid `CDR_REGISTRATION_NUMBER`.
That is enforced, not advisory.

## 1. Screen everyone BEFORE spending anything

O.C.G.A. § 44-12-239(d) disqualifies the CDR — or any **officer, owner, or
employee designated to act on its behalf** — on a conviction within **20 years**
of a misdemeanor *or* felony involving dishonesty, deceit, or fraud, or a civil
adjudication of breach of fiduciary duty.

**The $1,200 is nonrefundable and a disqualification is entity-fatal.** Screen
first. This step costs nothing and can save the whole venture.

## 2. File UP-CDR1

To `ucp.cdr.registration@dor.ga.gov`. Budget 4–8 weeks.

- [ ] UP-CDR1 registration form
- [ ] $1,200 fee (4-year term; $1,200 renewal)
- [ ] IRS Form W-9
- [ ] GA Secretary of State corporate registration confirmation
- [ ] Legible copy of front and back of each agent's driver's license
- [ ] PBSA-accredited background checks for at least one employee/agent —
      results emailed by the screener **directly** to
      `unclaimedpropertybackgrounds@dor.ga.gov`
- [ ] The `docs/DOR-QUESTIONS.md` list, in the same outreach

⚠ False information on the registration is a **felony** false statement under
O.C.G.A. § 16-10-20 (§ 44-12-239(c)).

## 3. On approval, capture the number

Set in the deployment environment — nothing generates without it:

```
CDR_REGISTRATION_STATUS=active
CDR_REGISTRATION_NUMBER=<issued by DOR>
CDR_REGISTRATION_EXPIRES_AT=<registration date + 4 years>
```

## 4. Buy the GA SOS bulk corporations file

$1,000 one-time, or $100 setup + $500/month. Office of Data Innovations,
`odi@gta.georgia.gov`, (404) 463-2300.

⚠ **Confirm before purchasing** that the file actually carries officer and
registered-agent fields rather than entity-level records only. The product page
does not enumerate the layout, it is non-refundable, and the answer determines
whether officer matching is one pass or two.

## 5. Get a Georgia opinion letter on the PI question

O.C.G.A. § 43-38-3(3)(C) defines "private detective business" to include
obtaining information about "the location, disposition, or recovery of **lost**
or stolen property", and § 43-38-14 has **no public-records exemption**. The
counter-argument — that § 44-12-239 is later and specific, creates a bespoke
registration regime for exactly this activity, and never mentions Title 43
Ch. 38 — is real but untested.

The risk sharpens the moment you skip-trace living owners beyond matching DOR's
own file. Keep `ENABLE_EXTERNAL_SKIPTRACE=false` until this is answered in
writing.

---

## ⚠ RECURRING DUTY: 30-day material-change notification

**§ 44-12-239(e): failure to notify DOR of a material change within 30 days is
IMMEDIATE REVOCATION.**

Set a standing reminder. Material changes include entity name, address, officers,
owners, designated agents, and anything affecting the § 44-12-239(d) fitness
answers.

| Date | Change | Notified DOR | By |
| --- | --- | --- | --- |
| | | | |

## Vicarious liability

§ 44-12-239.2(c): the registrant is liable where it "knew or should have known"
an agent was violating the article. Supervision is a compliance obligation, not
just good management.
