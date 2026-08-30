# Unikane PRD — Requirements that test themselves

> This file is the source for `kane-cli context ingest ./PRD.md`. Keep headings and ACs well-formed — the assurance pipeline extracts use-cases from these.

## 1. Overview

Unikane scans a real codebase, extracts what the product *actually* does, and generates two outputs: (1) Tutorial Slides (HTML, interactive), (2) Marketing One-Pager. Every claim in both is traced to a codebase fact or a cited research gap, and every interactive behavior is verified by Kane CLI.

## 2. Users

- **Founder** — needs seed deck that won't embarrass her in diligence
- **Developer** — wants README/tutorial that stays true as code changes
- **Reviewer/Judge** — needs evidence that claims are proved, not asserted

## 3. Use Cases & Acceptance Criteria

### UC-1: Connect codebase as ground truth
- **AC-1.1:** Given a GitHub URL, when I submit it, then the scanner returns `claims.json` with framework, routes (up to 20), API routes (up to 10), feature inventory, and README summary within 30s.
- **AC-1.2:** Given a private repo without auth, then the UI shows "Cannot access repo — check URL or connect GitHub" and does not proceed to generation.

### UC-2: Generate tutorial slides (HTML)
- **AC-2.1:** Given `claims.json` + prompt "tutorial for new developer", then the app generates 5 slides at `/deck/:id` with: Cover, Architecture, Key Flows (2 slides), and Interactive Demo embed.
- **AC-2.2:** Given the deck is generated, when I click Next through all 5 slides, then each slide title and content is visible, URL updates to `/deck/:id/slide/:n`, and no console errors occur.
- **AC-2.3:** Given slide 4 contains the TAM Calculator component, when I change the input from 100 to 200, then the displayed TAM value updates within 1s and matches `calc(input)`.

### UC-3: Generate marketing one-pager
- **AC-3.1:** Given the same `claims.json`, then the one-pager at `/deck/:id/one-pager` renders a hero, 3 feature bullets derived from actual routes, and a pricing comparison table — all within LCP <2500ms.
- **AC-3.2:** Given the one-pager is rendered, then all external links (docs, demo) return 200 and no 5xx API calls occur during load.

### UC-4: Requirements-to-tests pipeline (Lane 4)
- **AC-4.1:** Given `PRD.md` exists, when I run `kane-cli context ingest ./PRD.md --mode agent`, then `kane-cli context extract` yields at least 4 use-cases with cited claims linked back to this PRD.
- **AC-4.2:** Given extracted use-cases, when I run `kane-cli design tests --mode agent`, then at least one `_test.md` per use-case is committed under `.testmuai/tests/` with `mode: testing` frontmatter.
- **AC-4.3:** Given `_test.md` suite exists, when I run `kane-cli testmd run` against `http://localhost:3000/deck/demo`, then the evidence pack reports coverage as `ACs proved vs owed` and `kane-cli cover` shows completeness.
- **AC-4.4:** Given the PRD changes, when I run `kane-cli maintain reconcile --mode agent`, then the suite diff shows added/removed ACs and stale tests are flagged.

### UC-5: Closed loop — agent fixes what Kane finds
- **AC-5.1:** Given a Kane run fails at step N with remark "TAM calculator didn't update", then the coding agent reads `run_end` NDJSON, edits `components/slides/TamCalculator.tsx`, and re-triggers `kane-cli run --agent --headless` automatically without human opening the browser.
- **AC-5.2:** Given the fix is applied, then the next Kane run passes and the UI shows a green result card with `test_url` and duration.

### UC-6: Export & share
- **AC-6.1:** Given a deck at `/deck/:id`, then I can export PDF (print-to-PDF) and the exported file contains all 5 slides as pages.

## 4. Component Library (constrained — only these ship in v1)

| Component | Props | Kane assertion |
|-----------|-------|----------------|
| `TamCalculator` | `inputs: { tam, growth }` | `store TAM value as 'tam', change input, assert value updates` |
| `ArchDiagram` | `claims.routes` | `assert diagram renders 3 layers, no console errors` |
| `CompareTable` | `rows: { feature, us, compA, compB }` | `assert table has 5 rows, header contains 'Feature'` |
| `Timeline` | `steps: { title, date }[]` | `assert timeline step 3 is visible after scroll` |
| `DemoEmbed` | `url` | `assert iframe loads and URL contains /demo` |

No free-form codegen outside this library — safer to verify.

## 5. Non-goals (v1)

- No GitHub OAuth — paste URL only
- No PPTX export — PDF only
- No real market-research web fetch — stubbed `research.json` with 2 citations; replace later

## 6. Tech Constraints

- Next.js 14 App Router, TypeScript, Tailwind
- Kane CLI 0.8.5+, `--agent` NDJSON, `--headless` default
- `KANE_CLI_USER_AGENT=unikane` for all spawns
- Variables via `--variables-file` temp JSON, never hardcoded
- One serial queue for Kane runs (avoid parallel credit burn)

## 7. Demo Script (3min)

0:00 — Paste `https://github.com/tamago-labs/everclaw` + prompt "tutorial for new dev" -> Generate
0:40 — Show `claims.json` (routes detected)
1:00 — Open `/deck/demo`, click Next, show TAM calculator fail (Kane red run)
1:30 — Show agent reading NDJSON `remark`, editing file, re-run green
2:00 — Show `kane-cli context ingest -> design tests -> testmd run` evidence pack
2:30 — Export PDF + show `test_url` dashboard link
