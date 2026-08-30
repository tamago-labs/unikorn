# Plan — First Page Only (Everclaw structure + design.html)

## Goal
Restructure `unikane` to match `everclaw-new` layout: **root CLI + Vite frontend**, implement only the first page from `design.html` pixel-close. No scanner, no Kane wiring yet — just the landing shell that will host the loop later.

## Structure (mirrors everclaw-new)

```
unikane/
  package.json          # root CLI: express + ws + concurrently + tsx (port 3001)
  tsconfig.json
  src/
    index.ts            # express server, serves frontend/out in prod, proxies Vite in dev
    kaneCli.ts          # stub — returns not-configured for now (enables Overview later)
  frontend/
    package.json        # vite + react + tailwind (port 3000, like everclaw-new)
    vite.config.ts      # proxy /api -> http://localhost:3001
    index.html
    src/
      main.tsx
      App.tsx           # router shell
      pages/HomePage.tsx  # <-- first page from design.html
      index.css         # tailwind + Manrope
```

Dev: `npm run dev` -> concurrently `npm run dev:cli` (tsx src/index.ts :3001) + `npm run dev:web` (vite :3000)
Prod: `npm run build` -> `tsc && vite build -> frontend/dist` served by CLI

## First Page Spec (from design.html)

- Header: Unikane wordmark (gradient dot) + nav "How it works" + "Sign in" pill
- Hero: `What did you build today?` + sub `Drop in your code — Unikane turns it into slides you can actually show.`
- Input card: bordered white rounded-3xl, glow on focus (`border #7C5CFC + 4px rgba`), left attach button (paperclip), center textarea (1 row, placeholder `Paste a repo link, or just tell me what you made…`), right generate button (gradient + arrow)
- Chips row: 3 pills `📁 Attach folder` `🔗 GitHub repo` `Paste a snippet`
- Footer: `Every claim checked by Kane CLI`
- Colors: bg `#FBFAFE` + radial `#EFE9FB`, text `#251F33`, muted `#6E6480`, border `#E5DEFA`, accent `#7C5CFC`
- Font: Manrope 500/600/700/800

Behavior for v1 (no backend):
- Textarea auto-resizes 1->3 rows, Enter submits, Generate button disabled if empty
- Chips fill textarea with template text (e.g. `https://github.com/...`)
- Attach button -> file input (accept .zip/.md), shows filename pill, no upload yet
- On submit -> console.log + toast "Coming soon — scanner in next step" (keeps page testable by Kane)

## Kane-testable hooks (for future Lane 4 verification)

- `data-testid="unikane-input"` on textarea
- `data-testid="generate-btn"` on arrow button
- `data-testid="chip-github"` etc.
- `data-testid="hero-title"` on h1

Kane objective ready: `Go to http://localhost:3000, assert hero title is 'What did you build today?', fill input with 'https://github.com/tamago-labs/everclaw', click Generate, assert no console errors`

## Steps

1. Rewrite root `package.json` + `tsconfig.json` + `src/index.ts` (minimal express)
2. Scaffold `frontend/` (vite + tailwind + react-router)
3. Port `design.html` -> `frontend/src/pages/HomePage.tsx` (React, keep Tailwind classes 1:1)
4. Wire `frontend/src/App.tsx` router (only `/` -> HomePage)
5. Test `npm run dev` locally, verify first page renders at http://localhost:3000 and API health at :3001

Out of scope for this step: scanner, PRD ingest, deck generation, Kane wiring — next PR.
