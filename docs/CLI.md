# CLI reference

Every command is a `pnpm` script. All of them load `.env.local` automatically via
`--env-file-if-exists`, so there is nothing to `source` first.

Two things shape this list and are worth knowing before you run anything:

- **The heavy work is deliberately not serverless.** The bulk file is over a
  gigabyte and refreshes weekly under § 44-12-239.1(a). Ingest, acquisition and
  scoring are workstation commands by design, not endpoints somebody could invoke.
- **Nothing here can transmit.** Rehearsal mode withholds exactly three things —
  posting a solicitation, posting an agreement, emailing a claim to the Department
  — and every other command runs identically to how it will in production.
  `assertMayTransmit()` blocks the three at runtime, so there is no command in this
  document that can contact an owner today.

---

## Getting a database

Everything except the verification gates needs `DATABASE_URL` in `.env.local`.

Use the **Session pooler** connection string (port 5432), not the transaction
pooler and not the direct host:

- the transaction pooler (6543) cannot hold a session, and `COPY` needs one;
- the direct host is IPv6-only, which fails on most CI runners.

```bash
pnpm bootstrap:admin        # create the FIRST administrator
```

Deliberately a CLI script and never a web route. A route that grants
administrator access — even one guarded by "only if no admin exists yet" — is a
race the attacker wins by arriving first, and the prize is the entire statutory
file. Running this requires the database credentials.

---

## Getting data

```bash
pnpm acquire --list                       # what sources exist, and how stale
pnpm acquire --list --json                # machine-readable
pnpm acquire --source CA-SCO-UPD-500      # fetch, verify, extract
pnpm acquire --source CA-SCO-UPD-500 --force
```

**Acquire never loads.** It fetches, hashes, extracts, writes an
`acquisition.json` manifest, and prints the next command. The separation is
deliberate: retrieval and load fail for different reasons and one should not roll
back the other.

A source it may not fetch has **no URL field at all** — the permission type is a
discriminated union, so an unfetchable source is not a runtime error, it does not
compile. If a publisher that declares itself open answers with a challenge, the
fetch aborts and tells you not to retry, not to add a User-Agent, and not to
rotate headers. The wire wins over the declaration.

```bash
pnpm watch:sources                        # has a publisher released new data?
pnpm watch:sources --check                # exit 1 if anything changed; for CI
```

Runs weekly in GitHub Actions. It does `HEAD` requests and header comparison
only — no credential, no rows. See `.github/workflows/watch-sources.yml` for why
the load deliberately does not run there.

---

## Loading it

```bash
pnpm ingest --source <KEY> --file <PATH> --dry-run
pnpm ingest --source <KEY> --manifest /tmp/ca/acquisition.json
pnpm ingest --source <KEY> --file <PATH> --limit 4000     # bounded, for proving the path
pnpm ingest --source <KEY> --file <PATH> --keep-raw       # persist the source line
```

| Flag | Effect |
| --- | --- |
| `--dry-run` | Parse, infer the format, report; write nothing |
| `--manifest` | Load what `acquire` fetched, using its recorded hashes |
| `--limit N` | Stop after N rows. Real work, small blast radius |
| `--keep-raw` | Store each source line as JSONB. Roughly doubles disk |
| `--accept-mapping-change` | Proceed despite a changed column mapping |

The argument parser is a **declared spec**: an undeclared flag exits 1 and
suggests the nearest match. That exists because a loose parser once let
`--dryrun` run a live load silently.

`--keep-raw` is off by default and worth turning on for the Georgia file, where a
parser bug costs a week's wait for the next delivery.

```bash
pnpm score                 # score everything unscored or stale
pnpm score --rescore       # re-score under the current params version
```

Scores `properties_priority` — the categories SB 403's ≤$500 auto-pay cannot
reach — rather than the whole file. **`work_queue` inner-joins the scores**, so a
newly workable property does not appear anywhere until this has run.

```bash
pnpm snapshot:index        # refresh the public index statistics
```

Writes `data/seed/index-snapshot.json`. The public pages read that file and never
the database, because whether an aggregate over the Georgia file counts as
"distributing such information" under § 44-12-239.1(b) has never been construed.
The snapshot is scoped to California's openly-published file for that reason.

---

## Rules and seeds

```bash
pnpm seed:rules            # load state-rules.seed.json into state_rules
pnpm fixture --rows 100000 --out data/fixtures/week1.txt
```

Rules are data, not code. Georgia is verified; every other state loads with its
researched status intact and is **blocked** from all workflows —
`getStateRules()` throws on anything not `verified`, loudly, rather than
defaulting. Published aggregator fee tables were spot-checked and found
materially wrong on six states, which is why.

`pnpm fixture` generates a synthetic **file** for parser testing — pipe-delimited,
CRLF, BOM, sparse fields, malformed rows. That is not the same as fixture rows in
the database, which were removed; a synthetic file exercises the parser without
putting invented properties on a screen.

```bash
pnpm fixtures:remove --dry-run
pnpm fixtures:remove
```

Deletes demo properties and their workflow, score and event rows. Scoped by
`source_key`, and it refuses outright if any agreement references one — that
would mean real work was built on demo data and needs a person, not a cascade.

---

## Probes

Commands that prove something works without leaving anything behind.

```bash
pnpm probe:authority       # build three authority chains, read the verdicts, roll back
```

Runs inside a transaction that is always rolled back, then prints the row counts
to show nothing persisted. It exists in this form because `authority_links` and
`evidence_documents` are **append-only** — you cannot delete a link, only reject
it on review — so seeding demo authority evidence would have been a one-way
operation on the table where ambiguity is least acceptable.

---

## The gates

```bash
pnpm verify:all            # all fifteen
```

| Command | Holds |
| --- | --- |
| `verify:no-payments` | §1.1 — no payment SDK, no charge construction. § 44-12-239.2(a)(12) |
| `verify:templates` | §1.2 — every outbound template carries the legend; the public tree never does |
| `verify:legend` | §1.2 — the legend still matches the enrolled act, byte for byte |
| `verify:brand` | §1.3 — the name may not suggest a government agency. § 44-12-239(g) |
| `verify:no-public-data` | §1.8 — no unauthenticated read of the file. § 44-12-239.1(b) |
| `verify:public-surface` | Route architecture; registry ↔ filesystem bijection; API paths are not prefixes |
| `verify:acquisition` | One network door, no User-Agent, no browser |
| `verify:comparison` | Claims about named third parties are sourced and current |
| `verify:migrations` | Migrations reproduce the schema; every view is `security_invoker` |
| `verify:forms` | §6.2 — the four DOR PDFs are unchanged, by hash |

Three of these have failure modes worth knowing:

- **`verify:no-public-data` reads comments.** The literal phrase `from properties`
  anywhere under `app/`, `components/` or `lib/` fails the build, prose included.
  So does the string `service_role`, unconditionally, with no auth escape.
- **`verify:brand` is armed but silent** until `CDR_ENTITY_NAME` and friends are
  set. It passes today because nothing is configured.
- **`verify:migrations` checks a manifest**, so a new database object must be added
  to `data/seed/schema-manifest.json` or it will not be noticed.

```bash
pnpm test                  # unit + compliance
pnpm test:compliance       # one named test per §1 guardrail, statute in the name
pnpm test:e2e              # Playwright: the kill switch and the public surface
pnpm typecheck
pnpm lint
```

---

## Running it

```bash
pnpm dev                   # development
pnpm build && pnpm start   # production build, port 3000
```

**Offer state is baked at build time** by static generation, so changing
`CDR_REGISTRATION_STATUS` requires a rebuild. That is a deliberate consequence of
the public tree being static, and it is recorded in `docs/GO-LIVE.md`.

To see the site as it will look once registered:

```bash
CDR_REGISTRATION_STATUS=active \
CDR_REGISTRATION_NUMBER=... \
CDR_REGISTRATION_EXPIRES_AT=2030-01-01 \
  pnpm build && pnpm start
```

Nothing will transmit even then — that is gated separately, at runtime.

---

## The MCP server

```bash
pnpm mcp                   # stdio MCP server over the public surface
```

Exposes the public site to an agent: pages, the statutory fee calculator, state
coverage, the comparison data, and live registration status. It reads **only**
public surfaces and holds no database credential, so there is no configuration in
which it can return property data. See `docs/MCP.md`.
