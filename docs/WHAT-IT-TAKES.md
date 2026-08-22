# What it actually takes to operate

Two paths. You have built for the second one, which is the slower and more
lucrative. The first may let you start in days.

---

## Path A — California. Possibly no registration at all.

**Status: STRONG LEAD, NOT VERIFIED.** Two primary sources read 2026-08-22.
This is not the adversarial verification pass Georgia received, and the code
still refuses California by design until it gets one.

### What makes it fast

| | |
| --- | --- |
| Registration | **None found.** Cal. Civ. Proc. Code § 1582 imposes no registration, licensing, or bonding requirement on a locator. |
| PI licence | **Explicitly excluded.** Bus. & Prof. Code § 7541.1(b)(2) excludes heir/asset searches that involve "only a search of public records or other reference sources in the public domain" from the private-investigator licence. |
| Data | **Free, public, weekly.** The State Controller publishes downloadable bulk records with exact amounts — ~3.2M properties, ~$9.09B at ≥$500 — and maintains a public page about locators rather than treating them as a problem. |
| Fee cap | 10% of recovered property (§ 1582). |
| Cost to start | Effectively zero. |

The PI exclusion and the free public file fit together exactly: matching a
public record to a public address and posting a letter is squarely inside the
exemption. **That stops being true the moment you skip-trace beyond public
sources** — at which point § 7521 is back in play.

### § 1582 requirements

- Written agreement, **signed by the owner after receiving the disclosure**
- The disclosure must state: the nature and value of the property, that the
  Controller holds it, **and the address where the owner can claim it directly
  from the Controller** — a mandated "you can do this yourself for free"
  notice, like Georgia's legend
- Invalid if entered into between the holder's report and delivery to the
  Controller

### What must be settled before writing a line of California code

1. A full adversarial verification pass against primary sources — the same one
   that found six citation errors in the Georgia research
2. Confirm no separate Controller registration exists beyond § 1582
3. Byte-verify the § 1582 disclosure wording, exactly as the Georgia legend was
4. Pin the waiting-period mechanics: what starts it, what ends it
5. Confirm the 10% basis — recovered property, gross or net
6. Only then flip `states.CA.status` to `verified`

Until step 6, `getStateRules('CA')` throws, and that is deliberate.

---

## Path B — Georgia. Four to eight weeks, then a 30% cap.

Fully verified. The entire codebase is built for it.

### The complete list

| Step | What | Cost | Time |
| --- | --- | --- | --- |
| 0 | **§ 44-12-239(d) screening** of every officer, owner, and prospective claim-filer | £0 | 1 hour |
| 1 | Entity formed and registered with the GA Secretary of State | ~$100 | days |
| 2 | PBSA-accredited background checks, ≥1 agent, results sent by the screener **directly** to DOR | ~$50–150/person | days |
| 3 | UP-CDR1 + fee + W-9 + SOS confirmation + driver's licences | **$1,200** | — |
| 4 | DOR review | — | **4–8 weeks** |
| 5 | Set `CDR_REGISTRATION_NUMBER` — the kill switch opens | — | minutes |

**Roughly $1,500–2,500 all in.** No bond. No insurance. No Georgia residency
requirement. Four-year term. One $4,000 claim at 30% repays the whole thing.

### What registration unlocks — all four are gated

- Filing claims
- Receiving fee distributions
- **Obtaining DOR's data at all**
- Soliciting owners

There is no partial start. This is why "reach out this week" is not available in
Georgia, and no amount of engineering changes it.

### The one thing that can waste all of it

§ 44-12-239(d) disqualifies **the entity** if the CDR — or any officer, owner,
or employee designated to act for it — has, within **20 years**, a conviction
(felony *or* misdemeanour) involving dishonesty, deceit, or fraud, or a civil
adjudication of breach of fiduciary duty.

The $1,200 is non-refundable. The screen costs nothing. **Do it before anything
else on this page.**

---

## The comparison that matters

| | California | Georgia |
| --- | --- | --- |
| Time to first outreach | days | 4–8 weeks |
| Cost to start | ~$0 | ~$1,500–2,500 |
| Fee cap | 10% | **30%** |
| Data | free public bulk | statutory feed, exact amounts |
| Registration | none found | required |
| Verified? | **no** | yes |

At California's 10%, a $2,840 average claim yields ~$284. At Georgia's 30%, the
same claim yields ~$852 — three times the revenue for the same work, which is
why Georgia is worth the wait even though it is slower.

**They are not exclusive.** Georgia's registration runs on DOR's clock, not
yours. Filing UP-CDR1 and verifying California can happen in the same week.

---

## True in both, and in every state

- **No fee before approval.** Georgia bans even *soliciting* advance
  consideration (§ 44-12-239.2(a)(12)); California voids an agreement requiring
  prepayment (§ 1582).
- **The owner signs personally.** No power of attorney substitutes.
  Georgia's UP-1061 is still published and recites a repealed regime — using it
  voids the claim.
- **You must tell them they can do it free.** Both states mandate a disclosure
  saying exactly that. That is the market: the value is entitlement complexity —
  dissolved entities, merged entities, heirs, multi-owner property, securities,
  safe-deposit contents — not discovery.
- **Never take custody of the owner's money.** Every criminal prosecution in
  this industry was a redirected payment, not a fee dispute.
