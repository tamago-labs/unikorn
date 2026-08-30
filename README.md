# Unikane — Code is Truth. Kane is Proof.

**One-liner:** Paste a GitHub repo, get a tutorial + marketing deck that describes what you *actually* shipped — then Kane CLI proves every claim still works.

**Hackathon Lane:** Lane 4 — Requirements that test themselves (hybrid with Lane 1 slides). Repo init >=19 Aug 2026. Built with any agent, verified with Kane.

## The Loop (what judges score)

```
[Codebase] -> Code Scanner -> Claims Spec (what product says it does)
    -> PRD.md (ACs) -> kane-cli context ingest -> context extract -> design tests -> _test.md suite
    -> Tutorial Slides (HTML) + Marketing One-Pager (derived from same claims)
    -> kane-cli testmd run against live preview -> evidence pack (proved vs owed)
    -> if fail: agent reads run_end.remark -> regenerates slide/test -> re-verify
```

**Tight loop demo (3min video):**
1. Open `/deck/demo` — 5 slides visible
2. Show `kane-cli context ingest ./PRD.md` + `design tests` generating `_test.md`
3. Run `kane-cli testmd run` — 1 fail (e.g. "TAM calculator didn't update")
4. Agent reads NDJSON failure, edits `components/TamCalculator.tsx`
5. Re-run — green, evidence pack shows 6/6 ACs proved, share `test_url`

## What ships

| Output | Source of truth | Verified by |
|--------|-----------------|-------------|
| **Tutorial Slides (HTML)** | Code scanner (routes, components, API) + PRD claims | Kane: click through slides, assert each tutorial step loads |
| **Marketing One-Pager** | Same claims + research stub (pricing/comps) | Kane: assert no broken links, LCP <2500ms, no console errors |
| **_test.md suite** | PRD ACs (Lane 4) | Kane: `cover` shows coverage vs ACs, not test count |

## Stack

- Next.js 14 + TypeScript + Tailwind (slides are plain HTML, no canvas)
- Kane CLI 0.8.5+ (`--agent` NDJSON, `context`/`design`/`testmd`/`cover`)
- Any cloud agent (Claude Code / Cursor / Codex) — local QVAC not used for codegen

## Quick Start

```bash
npm install
npm run dev # -> http://localhost:3000

# Lane 4 flow (after PRD is ready)
kane-cli context ingest ./PRD.md --mode agent
kane-cli context extract --mode agent
kane-cli context list
kane-cli design tests --mode agent  # writes .testmuai/tests/*_test.md
kane-cli testmd run .testmuai/tests/tutorial_flow_test.md --agent --url http://localhost:3000/deck/demo --headless

# Slide-only loop
kane-cli run "Go to http://localhost:3000/deck/demo, click Next through 5 slides, assert the TAM calculator updates when input changes, assert no console errors" --agent --headless
```

## Project Structure

```
PRD.md                 # source for context ingest — well-formed ACs
src/
  lib/scanner.ts       # code scanner -> claims.json (routes, features, README parse)
  lib/planner.ts       # claims + prompt -> outline.json
  components/slides/   # interactive slide library (TamCalculator, ArchDiagram, CompareTable, Timeline, DemoEmbed)
  app/deck/[id]/       # slide renderer
  app/api/deck/        # generate deck endpoint
.testmuai/tests/       # generated _test.md (gitignored, but keep 1 sample for demo fallback)
scripts/verify.mjs     # one-command closed loop: generate -> kane run -> parse -> fix -> re-run
```

## Design Principles

- **Code is ground truth, prompt is intent** — scanner anchors claims, prompt only steers audience
- **Structured contracts** — `claims.json -> outline.json -> deck.json` so one slide can regenerate
- **Component library, not free-form code** — 5 components only, predictable for Kane
- **Verify before you show** — nothing reaches user without green `run_end`

## Credentials

No hardcoded secrets. Use `kane-cli --variables-file` via Variables UI. Credits: 10k free via testmuai.com/register.

## Submission Checklist (31 Aug 23:59 IST)

- [ ] Public repo (init >=19 Aug) + README with setup
- [ ] 3min YouTube unlisted video (show fail -> fix -> green)
- [ ] Live URL or `npm run dev` one-liner
- [ ] One paragraph: what/ who/ which agent/ what Kane does
