# Development Base — Option B (Lane 4 Hybrid)

This is your build checklist for the 3-day hackathon. Code is ready -> AI + Kane closes the rest.

## Phase 0: Init (30 min)

```bash
cd C:\projects\unikane
git init
git add . && git commit -m "init: unikane lane 4 hybrid"
npm install
npx tailwindcss init -p
# create app/ layout now — don't wait
```

Create `app/layout.tsx`, `app/page.tsx` (paste URL + prompt form), `app/deck/[id]/page.tsx` (slide renderer).

## Phase 1: Code Scanner -> claims.json (4h)

Stub first, don't over-engineer.

`src/lib/scanner.ts`:
- Input: `githubUrl: string`
- Output: `claims.json` = `{ framework, routes, apiRoutes, fileCount, readmeExcerpt, features: string[] }`
- Implementation: fetch `https://raw.githubusercontent.com/<owner>/<repo>/main/package.json` + README, parse with regex for `app/` routes fallback. No clone needed for demo. For local fallback, read `C:\projects\everclaw-new` as demo repo.

`src/lib/planner.ts`:
- Input: `claims.json + prompt`
- Output: `outline.json` = `{ slides: [{ type: 'TamCalculator'|'ArchDiagram'|'CompareTable'|'Timeline'|'DemoEmbed', title, props }] }`

## Phase 2: Slide Library + One-Pager (6h)

Create `components/slides/` — one file per component (5 files, <100 lines each):

- `TamCalculator.tsx` — input `value`, display `value*1.5`, use `useState`, ensure `data-testid="tam-value"` for Kane `store` assertion
- `ArchDiagram.tsx` — 3 boxes with routes from claims
- `CompareTable.tsx` — static 5-row table
- `Timeline.tsx` — vertical steps
- `DemoEmbed.tsx` — iframe to `http://localhost:3000` for self-demo

`app/deck/[id]/one-pager.tsx` — hero + 3 bullets + CompareTable.

All slides must be server-renderable, no canvas, so Kane `Visual` checkpoints work.

## Phase 3: Lane 4 Assurance Wiring (3h)

This is the loop judges score:

```bash
# 1. Ingest PRD (this file is already well-formed for extraction)
kane-cli context ingest ./PRD.md --mode agent
kane-cli context extract --mode agent
kane-cli context list  # verify >=4 use-cases

# 2. Design tests
kane-cli design tests --mode agent
# -> writes .testmuai/tests/*_test.md  (commit one sample for fallback)

# 3. Run
kane-cli testmd run .testmuai/tests/tutorial_flow_test.md --agent --url http://localhost:3000/deck/demo --headless --timeout 600
kane-cli cover  # shows ACs proved vs owed
```

If `context` commands fail (credits/config), fallback to `scripts/verify.mjs` single-flow loop — still passes `Verified`.

## Phase 4: Closed Loop Script (2h)

`scripts/verify.mjs` — the tight loop:

```js
// pseudo
import { spawn } from 'child_process'
const objective = `Go to http://localhost:3000/deck/demo, click Next through 5 slides, store the TAM calculator value as 'tam_before', change input to 200, assert TAM value not equals '{{tam_before}}', assert no console errors`
const child = spawn('kane-cli', ['run', objective, '--agent', '--headless', '--url', 'http://localhost:3000/deck/demo'], { env: {...process.env, KANE_CLI_USER_AGENT:'unikane'}})
// parse NDJSON stdout, on run_end.status==='failed' -> read remark -> call agent to patch component -> re-run
```

For hackathon, the "agent" can be you manually editing + re-running — just show NDJSON on screen. Fully automatic is bonus, not required.

## Phase 5: Polish for Submission (2h)

- `next build` must pass
- `README.md` one paragraph + live URL or `npm run dev` instructions
- One sample evidence pack in `scripts/sample-evidence/` for offline judging
- 3min video script is in `PRD.md:7` — record screen, no editing needed

## File Map (create in this order)

1. `app/page.tsx` — Home: URL input + Prompt + Generate button -> `/deck/demo`
2. `app/deck/[id]/page.tsx` — Slide deck (Next + Previous, 5 slides)
3. `components/slides/TamCalculator.tsx` — interactive, testable
4. `src/lib/scanner.ts` — claims.json
5. `scripts/verify.mjs` — closed loop
6. `.testmuai/tests/tutorial_flow_test.md` — one committed sample test

## Gotchas

- Don't run Everclaw on :3000 — Unikane uses :3000, Everclaw is :3001
- `C:\projects\everclaw-new` is your demo repo for scanner — use it in video
- Kane credits: 9549 available — enough, but use `--headless` always
- PRD.md headings matter — don't rename UC/AC sections or `context extract` misses them
