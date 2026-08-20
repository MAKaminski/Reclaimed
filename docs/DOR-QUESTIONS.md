# Written questions for the Georgia DOR Unclaimed Property Section

Send with the UP-CDR1 registration package to `ucp.cdr.registration@dor.ga.gov`.
General counsel: (404) 417-2225.

Track answers here. Each unanswered question has a corresponding conservative
default in code — the default is not a guess we forgot to resolve, it is a
deliberate fail-safe.

| # | Question | Code default while unanswered | Answer |
| --- | --- | --- | --- |
| 1 | **[HIGHEST VALUE]** Will the UCP Section honor an **out-of-state remote online notarization** on UP-CDR2/UP-CDR4, per Policy Bulletin ADMIN-2025-03? Does the claimant's own physical location matter? | `SIGNATURE_MODE=wet_ink`; RON built but shipped disabled behind `ENABLE_RON_SIGNATURE=false` | — |
| 2 | Does the **120-day unenforceability window** under § 44-12-220(d.1)(4) run from the agreement date, or from the holder's delivery/payment to the commissioner? | Anchored to delivery; unknown or year-precise dates treated as **inside** the window. `TODO(DOR-CONFIRM-120)` in `lib/compliance/windows.ts` | — |
| 3 | What documentation is required for a claim by a **dissolved** entity? A **merged** entity? Is an unbroken chain-of-title through name changes required? | `entity_status ≠ active` blocks auto-progression and forces named-human review | — |
| 4 | Does a **corporate resolution, secretary's certificate, or EIN letter (CP-575)** satisfy the "work ID card" requirement? | Evidence required for every authority link; no substitution assumed | — |
| 5 | **Bulk file mechanics**: exact delimiter, encoding, header row, file count, and transport (SFTP vs HTTPS link vs attachment)? | Parser sniffs all four and records every inference on an `ingest_manifest` row | — |
| 6 | Will DOR confirm in writing that a **specific named e-signature product** satisfies Rule 560-1-1-.14(1)(a)? | No product assumed compliant; wet ink only | — |

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
