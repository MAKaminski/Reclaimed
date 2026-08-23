# MCP server

An MCP server exposing the Reclaimed **public** surface, so an agent can navigate
the site, do the statutory fee arithmetic, check jurisdiction coverage, compare
recovery options, and read our live registration status.

```bash
pnpm mcp
```

Speaks MCP over stdio.

## Register it

Claude Code:

```bash
claude mcp add reclaimed -- pnpm --dir /Users/kaminski/Reclaimed mcp
```

Or by config, for any MCP client:

```json
{
  "mcpServers": {
    "reclaimed": {
      "command": "pnpm",
      "args": ["--dir", "/Users/kaminski/Reclaimed", "mcp"]
    }
  }
}
```

No credentials. The server reads the repo and fetches public pages over HTTP;
`NEXT_PUBLIC_SITE_URL` decides which origin it reads from and defaults to
`http://localhost:3000`.

---

## The one thing it cannot do

**There is no property search and no owner lookup, in any configuration.**

O.C.G.A. § 44-12-239.1(b) permits a claimant's designated representative to
receive the Department's unclaimed property file only *"for the purpose of
soliciting owners of unclaimed property to offer claim services."* A tool
answering *"what unclaimed property exists for this name"* is a lookup service
built on that file, which is the exact use the statute forecloses — and `/about`
carries a standing public promise that we will never build one.

That is enforced by absence rather than by policy. This process **holds no
database credential** and imports nothing from `@/lib/db`. There is no
configuration flag that turns property access on, because there is no code path
that could use it.

`read_page` is allowlisted against the public page registry for the same class of
reason. A tool that will `GET` whatever path it is handed is an SSRF primitive
pointed at our own origin, and the staff tree lives on that origin. Asking it for
`/queue` returns a refusal, not a page.

Read `reclaimed://policy` for the version of this an agent will see.

---

## Tools

| Tool | Answers |
| --- | --- |
| `list_pages` | What is on the public site. Optionally filtered by section |
| `read_page` | The readable text of one public page. Allowlisted |
| `compute_fee` | The § 44-12-224(d)(1) cap, with costs counted inside it |
| `state_coverage` | All 51 jurisdictions, our rules status, and the statutory fee ceiling |
| `registration_status` | Whether we may solicit, accept referrals, and how many claims we have filed |
| `compare_alternatives` | Named recovery options side by side, each claim with its source and date |
| `market_stats` | National and Georgia figures, plus our own index size, all sourced |

### `compute_fee` is the one worth trying first

It encodes the trap in the statute. Fees **and costs** are capped together at 30%
of the *lesser* of the amount claimed or the property value — costs come out of
the fee, not on top of it.

```
compute_fee(claimedUsd: 12000, propertyValueUsd: 12000, costsUsd: 150)
→ effectiveTakePct:          30
  totalTakeIncludingCosts:   $3,600.00
  feeExcludingCosts:         $3,450.00
  costsRecovered:            $150.00
  netToClaimant:             $8,400.00
  capBinding:                true
```

The requested 30% plus $150 of costs would have been $3,750. The cap clamped it
to $3,600 and the fee absorbed the costs. A representative who adds costs on top
of a 30% fee is over the cap, and § 44-12-224(d)(1) reduces the agreement to 30%
with the Department remitting the difference to the claimant directly.

`state_coverage` has a related trap: a `null` fee cap means that state has **no**
percentage ceiling, not a ceiling of zero. Five of the states researched so far
are in that position.

---

## Resources

| URI | Contents |
| --- | --- |
| `reclaimed://mission` | The purpose, in one sentence and one paragraph |
| `reclaimed://policy` | What this server will not do, and why |

---

## What an agent should carry away

If a model paraphrases anything from this server, these are the facts worth
carrying — they are the same ones `/llms.txt` publishes:

- Anyone may claim Georgia unclaimed property themselves, **free**, at
  `gaclaims.unclaimedproperty.com`. Using a representative does not make the
  Department pay faster.
- The median claim paid across all state programmes is **$144.30**. For a claim
  that size no percentage fee is worth paying.
- Georgia caps a representative's total fees **and costs** at 30% of the lesser of
  the amount claimed or the property value.
- Charging any fee **before** a claim is approved is prohibited.
- **Reclaimed is not currently registered and is not accepting clients.**

---

## Related

- `docs/CLI.md` — every other command in this repo
- `/for-partners` and `/api/openapi.json` — the referral API, which is a separate
  surface with the same inbound-only rule
