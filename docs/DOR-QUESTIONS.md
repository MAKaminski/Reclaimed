# Written questions for the Georgia DOR Unclaimed Property Section

Send with the UP-CDR1 registration package to `ucp.cdr.registration@dor.ga.gov`.
General counsel: (404) 417-2225.

Track answers here. Each unanswered question has a corresponding conservative
default in code — the default is not a guess we forgot to resolve, it is a
deliberate fail-safe.

| # | Question | Code default while unanswered | Answer |
| --- | --- | --- | --- |
| 1 | **[HIGHEST VALUE]** Will the UCP Section honor an **out-of-state remote online notarization** on UP-CDR2/UP-CDR4, per Policy Bulletin ADMIN-2025-03? Does the claimant's own physical location matter? | `SIGNATURE_MODE=wet_ink`; RON built but shipped disabled behind `ENABLE_RON_SIGNATURE=false` | **Regulatory chain found — see below. Still unanswered operationally; flag stays off.** |
| 2 | Does the **120-day unenforceability window** under § 44-12-220(d.1)(4) run from the agreement date, or from the holder's delivery/payment to the commissioner? | Anchored to delivery; unknown or year-precise dates treated as **inside** the window. `TODO(DOR-CONFIRM-120)` in `lib/compliance/windows.ts` | — |
| 3 | What documentation is required for a claim by a **dissolved** entity? A **merged** entity? Is an unbroken chain-of-title through name changes required? | `entity_status ≠ active` blocks auto-progression and forces named-human review | — |
| 4 | Does a **corporate resolution, secretary's certificate, or EIN letter (CP-575)** satisfy the "work ID card" requirement? | Evidence required for every authority link; no substitution assumed | — |
| 5 | **Bulk file mechanics**: exact delimiter, encoding, header row, file count, and transport (SFTP vs HTTPS link vs attachment)? | Parser sniffs all four and records every inference on an `ingest_manifest` row | — |
| 6 | Will DOR confirm in writing that a **specific named e-signature product** satisfies Rule 560-1-1-.14(1)(a)? | No product assumed compliant; wet ink only | UP-CDR2 Rev. 04/09/2025 § VI names the rule but no product. Ask on the same call. |
| 13 | Does the **§ 44-12-220(i) heir affidavit** still require notarisation? SB 403 waives the probate *order*; it does not obviously waive the notary. | Notary assumed required | — |
| 14 | For an out-of-state RON, does the **claimant's own physical location** matter, or only the notary's commissioning state? | Assumed to matter; wet ink until answered | — |

## Question 1 — the chain we found, and why the flag is still off

Found 23 August 2026. **Nothing here has been confirmed by the Department**, and
`ENABLE_RON_SIGNATURE` remains `false`.

1. **Ga. Comp. R. & Regs. r. 560-1-1-.14(3)(a)** — filed 6 March 2025, effective
   **26 March 2025**: the Department "will accept remote notarizations from notary
   publics in states where remote notarization is permitted by law … authorized by the
   Commissioner through … other documents accepted as Department guidance." The prior
   version required a **Georgia-licensed attorney notary physically in Georgia**. That
   requirement was deleted.
2. **Form UP-CDR2, Rev. 04/09/2025 § VI** — "Where remote notarization is allowed by law,
   an electronic signature is acceptable provided that it complies with Rule
   560-1-1-.14(1)(a)". The form is the "other documents accepted as Department guidance"
   hook the rule requires, which closes the chain.
3. **Policy Bulletin ADMIN-2025-03**, 28 May 2025 — restates it, binding on DOR personnel.
4. **O.C.G.A. § 44-12-224** requires a *manual signature*, with an electronic signature
   sufficient under § 10-12-17. **Notarisation is a form requirement, not a statutory
   one**, so DOR has discretion here and has already exercised it.

Item 2 is verified **first-hand**, not taken on report: the pinned UP-CDR2 in
`data/seed/form-hashes.json` (sha256 `2ba06b30…`, the same bytes `verify:forms` checks
every run) stamps `Form UP-CDR2 (Rev 04/09/2025`, carries the remote-notarisation clause
verbatim, and instructs filing **by email** to `ucp.cdr.claims@dor.ga.gov` with the
warning that an incomplete agreement makes the claim void.

**So why is the flag still off?** Because the regulatory reading and the operational
reality are different questions. The Unclaimed Property Section is an operational unit
that may not have internalised a March 2025 rule change, and nobody has published
confirmation that a RON-notarised UP-CDR2 has actually been accepted. Georgia awards
contested property to **whoever files a complete claim first** — so a rejected claim does
not delay revenue, it hands the property to a competitor. A wrong assumption here is
uniquely expensive.

**One phone call resolves it:** DOR Office of General Counsel, **(404) 417-2225**, the
contact printed on ADMIN-2025-03. Ask precisely: *"Will the Unclaimed Property Section
accept a UP-CDR2 that is e-signed by the claimant and notarised by a Florida-commissioned
RON notary, submitted as a PDF to ucp.cdr.claims@dor.ga.gov?"* Ask questions 6, 13 and 14
on the same call.

## Why question 1 is worth the most

It determines whether a digital flow exists at all. Georgia has not enacted
general RON — HB 289 died at sine die on 2026-04-02 — and Rule 560-1-1-.14's
"remote notarization" is the narrow attorney-supervised model requiring a
Georgia-licensed attorney physically in Georgia. ADMIN-2025-03 says DOR will
"accept remote notarizations from notary publics in states where remote
notarization is permitted by law," but that has never been confirmed for
UP-CDR2/CDR4 specifically.

Cite carefully: **the forms point to DOR Rule 560-1-1-.14(1)(a)**, not to the
bulletin. The rule governs whether an e-signature qualifies; the bulletin is what
accepts out-of-state remote notarization.

No published allow-list of approved e-signature products was found. Treat that as
an argument from absence, not a DOR statement — **there is no safe harbor**, and a
rejected signature voids the claim under § 44-12-224(b).

## Also worth requesting

An **Open Records Act** request (O.C.G.A. § 50-18-70) for UP Section performance
metrics — aggregate operational statistics are not owner-identifying, so
§ 44-12-225 should not shield them, and § 50-18-71 makes it cheap (first quarter
hour free, 10¢/page). Georgia publishes no unclaimed-property annual report; the
$3.3B figure is secondary-source only and undated.

---

## Questions 7–12 — the public website

Added 2026-08-22 with the public surface (ADR-0010). Same convention as above: each
carries the conservative default the code holds while the question is unanswered.

### 7. Is a "not yet registered" website a solicitation?

Does the Department consider a publicly available website that describes CDR
services and states a fee, **while expressly stating the operator is not registered
and is not accepting clients**, to be a "solicitation to enter into an agreement"
under § 44-12-239.2(a)(10)? If so, what would make it not one?

> **Default:** `getOfferState()` returns `pre_registration` — no call to action, no
> contact capture, no agreement path, and an express declination on every page.

### 8. Would carrying the legend while unregistered itself be misleading?

If such a page **is** a solicitation, must it carry the § 44-12-239(f) legend — and
would carrying a notice reading "THIS IS A SOLICITATION" while not offering services
itself be false or misleading under § 44-12-239.2(a)(5)?

> **Default:** the legend is withheld before registration, and CI **fails the build**
> if its text appears anywhere in the public tree.

### 9. How is the legend sized on a web page?

For a web page, what does the Department treat as "the font utilized in the
solicitation" for § 44-12-239(f) sizing — body text, the largest text on the page,
or something else? Is a CSS pixel treated as a point?

> **Default:** `PUBLIC_MAX_POINT_SIZE = 21`, so the legend renders at 22pt — larger
> than **every** element on the page — and CI blocks any larger type.

### 10. How does "per act" count for a published page?

How does the Department count "each such act" under § 44-12-239.2(b)(5) for a
continuously published web page — per page, per day published, or per visitor?

> **Default:** no commercial page is published in any state where solicitation is
> not permitted.

### 11. May an applicant publish while UP-CDR1 is pending?

May a registration applicant publish a website describing the services it intends to
offer while its application is pending? Is there Department-preferred disclosure
language we should use instead of our own?

> **Default:** our own disclosure, `lib/public/disclosure.ts`, whose required
> elements are pinned by a substance test in CI.

### 12. Can the public verify a registration number?

Is there a Department-published list of registered CDRs, or any way for a member of
the public to verify a representative's CDR identification number?

> **Default:** `/is-this-letter-real` tells readers to ask for the number — which
> § 44-12-224(c)(6) requires on every agreement — and to confirm it by calling the
> Unclaimed Property Program.

This one is worth asking on its own merits. It is the missing consumer-protection
primitive in the whole regime: the statute requires a registration number on every
agreement but gives an owner no way to check it against anything.
