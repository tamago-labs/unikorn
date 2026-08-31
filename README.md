# Unikorn

[![npm version](https://img.shields.io/npm/v/@tamago-labs/unikorn.svg)](https://www.npmjs.com/package/@tamago-labs/unikorn)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**Your agent + Kane AI made the product. Unikorn turns it into the PRD, tutorial, pitch deck, and everything needed to explain what you shipped.**

<img width="1376" height="743" alt="Screenshot 2026-08-31 211230" src="https://github.com/user-attachments/assets/30930b45-4da8-40b9-aaa8-d1dd1a2f32c9" />

Unikorn is a local-first application that combines **AI product understanding** with **real-browser automation through kane-cli**. You give it a project folder, it scans the codebase and generates a cited PRD, turns its use cases into runnable browser scenarios, and runs them against the real application through Kane.

Unikorn collects the results of those runs as persistent product evidence — including screenshots, observed values, browser state, console output, and network activity. That evidence becomes the foundation for generating **tutorials, pitch decks, and other self-contained HTML artifacts** that reflect what the product actually does.

The web UI runs at `http://localhost:3001`, while all Unikorn data is stored locally under `~/.unikorn`.

**Every claim traces back to source code. Every verified result comes from a real browser run.**

## Overview

AI can write code, but a product needs more than software — it needs a PRD, a pitch deck, a tutorial. Unikorn connects two capabilities that are usually separated: AI document generation and browser automation. Your model drafts the PRD from a codebase scan, kane-cli proves (or disproves) each behavior against the running app, and the generation stage turns PRD + collected proof into artifacts.

The pipeline:

```
folder → scan → PRD (AI, cited) → ingest → review → design tests
      → run tests (real browser) → collect run facts
      → tutorial / slide deck (HTML, one page each, screenshots inlined)
```

## Highlights

- **Codebase inventory** — Framework detection, routes, ports, auth hints, package manager; served to the AI as grounding context.
- **AI PRD generation** — Streams a Kane-compatible PRD (Overview, Users, Use Cases with Given/When/Then ACs, Non-goals, Tech Constraints, Environment). Every claim ends with `[src: path]` or "AI-generated, unverified". Clarifying questions pause the flow and are answered in the UI.
- **Kane assurance pipeline** — `context ingest → review → design tests → testmd run → cover gaps`, driven step-by-step from the UI with live NDJSON event streaming, elapsed/credit counters, and inline pause answering.
- **Pause / resume sessions** — Kane pauses are first-class: questions render in the UI with options and recommendations; checkpoint pauses (no questions) resume with one click; resumable sessions survive server restarts.
- **Run collection** — Every `testmd run` persists status, summary, duration, `test_url` and the agent's stored values (`final_state`) to `runs.json` — the "collected info" that powers later artifacts.
- **Evidence viewer** — Each run seals an evidence pack (per-step screenshots, console/network logs). Unikorn captures the pack per run and offers a one-click hosted viewer link.
- **Artifact generation** — 2-shot AI: outline JSON → rendered HTML pages. Tutorial (step per use-case) and slide decks (pitch / demo walkthrough), with the user's design prompt honored verbatim. Screenshots are extracted from evidence packs and inlined as base64 — every page is fully self-contained HTML + TailwindCSS.
- **Bring your own model** — Any OpenAI-compatible API (baseUrl + apiKey + model) configured locally. Nothing is hardcoded.

## System Requirements

### Required

| Requirement | Notes |
|-------------|-------|
| **Node.js >= 18** | Express + WebSocket server, kane-cli |
| **kane-cli >= 0.6.1** | Install separately (`kane-cli whoami` should report Authenticated). Assurance commands need 0.6.1+; pause/resume UX targets 0.7.1+ |
| **An OpenAI-compatible API** | baseUrl + apiKey + model, set in Settings → AI Provider |

### Recommended

| Requirement | When it is needed |
|-------------|-------------------|
| **kane-cli credits > 5** | Ingest / design / test authoring consume kane credits |
| **Dev server of the target app** | Needed for the "Run tests" stage — Unikorn can start it for you |

## Quick Start

### Install and run

```bash
npx @tamago-labs/unikorn
```

Then open `http://localhost:3001`, set your AI provider in Settings, and point Unikorn at a project folder.

### From source

```bash
git clone https://github.com/tamago-labs/unikorn
cd unikorn
npm install

# Dev (CLI on :3001 + Vite frontend on :3000)
npm run dev

# Production build (frontend/dist served by CLI)
npm run build
npm start
```

### The end-to-end flow

**1. Generate the PRD** — Open a project, press *Scan & Generate*. The AI reads the inventory, may ask clarifying questions (answered inline), and streams a cited PRD. Saved to `~/.unikorn/projects/<hash>/PRD.md`.

**2. Verify with Kane** — Open the *Kane* tab:

| Step | What happens |
|------|--------------|
| **Ingest PRD** | `kane-cli context ingest` extracts use-cases from the PRD (`--mode agent`, streamed) |
| **Review** | Derived use-cases are approved (explicit user action) |
| **Design tests** | Every trusted use-case gets ACs, scenarios and 1:1 `_test.md` tests under `.testmuai/tests/` |
| **Run tests** | Each test is authored once in a real browser (`testmd run`), headless, with `start_url` injected via `--variables-file`. Results land in `runs.json` |
| **Coverage** | `cover gaps` shows designed % × proven % |

Kane may pause with a question — answer it right in the UI. Stuck `ask_user` prompts in headless runs auto-skip after 90s.

**3. Build artifacts** — Open *Tutorial* or *Slide deck* → *New*: pick type (tutorial / pitch / demo walkthrough), topic (a use-case or the full tour), audience, and a design prompt. Two AI shots later you get a linked page set — open it straight from the Gallery card.

### Verify kane-cli

```bash
kane-cli --version
kane-cli whoami        # should report Authenticated
kane-cli balance       # Available / Total credits
```

Unikorn surfaces this via `GET /api/kane/status` and the status bar. Artifacts, runs and PRDs are stored per-project under `~/.unikorn/projects/<hash>/` — the target repo is never modified.

## Kane CLI Integration

Unikorn does not bundle kane-cli. It detects the local install, streams every `--mode agent` NDJSON stream live, and treats kane's pause semantics (`exit 3` = resumable checkpoint) as first-class UI state. All runs set `KANE_CLI_USER_AGENT=unikorn`.

| Feature | What it does | Where in code |
|---------|--------------|---------------|
| **Status polling** | Checks `kane-cli --version`, `whoami`, `balance`; serves Kane availability in the topbar | [`src/index.ts:72`](https://github.com/tamago-labs/unikorn/blob/main/src/index.ts#L72) |
| **Async job runner** | Spawns kane-cli as a background job (never blocks the server), captures NDJSON events, tracks credits and last activity | [`src/index.ts:410`](https://github.com/tamago-labs/unikorn/blob/main/src/index.ts#L410), [`src/index.ts:626`](https://github.com/tamago-labs/unikorn/blob/main/src/index.ts#L626) |
| **Pause / resume** | Parses `session_paused` (questions, sid, verbatim resume command); resume with `--message` or verbatim for checkpoint pauses | [`src/index.ts:632`](https://github.com/tamago-labs/unikorn/blob/main/src/index.ts#L632), [`frontend/src/components/KaneFlow.tsx:368`](https://github.com/tamago-labs/unikorn/blob/main/frontend/src/components/KaneFlow.tsx#L368) |
| **Ingest** | `context ingest <PRD> --mode agent` straight from the Unikorn store — nothing written into the user's repo | [`src/index.ts:725`](https://github.com/tamago-labs/unikorn/blob/main/src/index.ts#L725) |
| **Review** | `context review --approve` / `--verdicts` for the derived use-cases | [`src/index.ts:758`](https://github.com/tamago-labs/unikorn/blob/main/src/index.ts#L758) |
| **Design** | `design tests --use-case <uc> --mode agent --max N` per trusted use-case, sequential batch with progress | [`src/index.ts:758`](https://github.com/tamago-labs/unikorn/blob/main/src/index.ts#L758), [`frontend/src/components/KaneFlow.tsx:287`](https://github.com/tamago-labs/unikorn/blob/main/frontend/src/components/KaneFlow.tsx#L287) |
| **testmd run** | `testmd run <file> --agent --headless --variables-file <tmp>`; `start_url` resolved from the scanned dev port | [`src/index.ts:766`](https://github.com/tamago-labs/unikorn/blob/main/src/index.ts#L766) |
| **ask_user watchdog** | Headless runs can't answer `ask_user` — auto-skip after 90s idle (frontend + backend layers) | [`frontend/src/components/KaneFlow.tsx:211`](https://github.com/tamago-labs/unikorn/blob/main/frontend/src/components/KaneFlow.tsx#L211) |
| **Run collection** | `run_end` → status, summary, `final_state`, `test_url` persisted to `runs.json` per project | [`src/index.ts:647`](https://github.com/tamago-labs/unikorn/blob/main/src/index.ts#L647) |
| **Evidence viewer** | Newest `.evidence` pack captured per run; `evidence serve` proxied to the hosted viewer URL | [`src/index.ts:831`](https://github.com/tamago-labs/unikorn/blob/main/src/index.ts#L831) |
| **Coverage** | `cover gaps --json` parsed tolerantly (designed % × proven %, per-UC debt) | [`src/index.ts:686`](https://github.com/tamago-labs/unikorn/blob/main/src/index.ts#L686) |
| **Assurance UI** | Live job panel: event stream, elapsed/idle, credits, pause questions, suggested `next[]` commands, run results drawer | [`frontend/src/components/KaneFlow.tsx`](https://github.com/tamago-labs/unikorn/blob/main/frontend/src/components/KaneFlow.tsx) |

## PRD Generation

`POST`-less WebSocket flow: `prd:start` → inventory → optional clarifying questions → streamed PRD captured through a `save_prd` tool call (provider-agnostic, with a text fallback for models that never emit tool calls). The PRD template includes a mandatory *Environment* section (Start URL, Command, Auth) so the Kane pipeline can run the app.

- Streaming preview in the drawer, thinking separated from content, tool-leak tags stripped generically.
- Saved to `~/.unikorn/projects/<hash>/PRD.md` + `prd.meta.json`.

| Feature | Where in code |
|---------|---------------|
| WS handler | [`src/index.ts:1589`](https://github.com/tamago-labs/unikorn/blob/main/src/index.ts#L1589) |
| Tool-leak fallback | [`src/index.ts:1393`](https://github.com/tamago-labs/unikorn/blob/main/src/index.ts#L1393) |

## Artifacts (Tutorial / Slide Deck)

Two AI shots: **outline JSON** (sections, verified claims, screenshot mapping) → **rendered HTML** (`save_artifact` tool: `index_html` + one file per slide/step). The backend then:

1. Extracts step screenshots from the evidence packs (pure-JS zip reader — annotated PNG preferred, JPEG fallback) — [`src/index.ts:942`](https://github.com/tamago-labs/unikorn/blob/main/src/index.ts#L942)
2. Inlines every referenced image as base64 → each page is fully self-contained — [`src/index.ts:1012`](https://github.com/tamago-labs/unikorn/blob/main/src/index.ts#L1012)
3. Injects deterministic navigation (Prev / 1-of-N / Next pills + arrow-key handler) on every page

Hard rules in every render: claims trace to PRD or run evidence, "✓ verified" badges quote real observed values, footer stamp "Verified by Kane · N/M checks passed", TailwindCSS + Manrope, user design prompt honored verbatim.

| Feature | Where in code |
|---------|---------------|
| Generation flow (WS `artifact:start`) | [`src/index.ts:1175`](https://github.com/tamago-labs/unikorn/blob/main/src/index.ts#L1175) |
| Creation wizard | [`frontend/src/components/ArtifactWizard.tsx`](https://github.com/tamago-labs/unikorn/blob/main/frontend/src/components/ArtifactWizard.tsx) |
| Serving | [`src/index.ts:1068`](https://github.com/tamago-labs/unikorn/blob/main/src/index.ts#L1068) |

## Storage

```
~/.unikorn/
  aiConfig.json                       # baseUrl / apiKey (masked in UI) / model
  projects/<hash-of-folder>/
    inventory.json                    # codebase scan
    PRD.md                            # generated PRD
    prd.meta.json
    runs.json                         # collected test-run facts
    vars-*.json                       # temp --variables-file payloads
    artifacts/
      tutorial/<id>/                  # index.html + step pages + assets/ + meta.json
      deck/<id>/                      # index.html + slide pages + assets/ + meta.json
```

The target codebase is read-only; generated `.context/` and `.testmuai/` state inside it belong to kane-cli.

## Project Structure

```
src/
  index.ts               # Express + WebSocket server: PRD gen, kane jobs, artifacts, static UI
frontend/                # React + Vite + Tailwind (built to frontend/dist, served by CLI in prod)
  pages/
    DesignApp.tsx        # PRD card, tabs (Tutorial / Slide deck / Marketing / Kane), Gallery
    HomePage.tsx         # Landing: point Unikorn at a folder
  components/
    KaneFlow.tsx         # Kane assurance steps, job panel, pause answers, runs + evidence
    ArtifactWizard.tsx   # Tutorial / deck creation drawer
    AiDrawer.tsx         # PRD generation drawer (streaming + clarifying questions)
scripts/
  test-kane-flow.mjs     # Manual kane flow smoke script
```

### API

```
GET  /api/health                        # { status, kaneJobs }
GET  /api/kane/status                   # kane-cli available / version / authenticated / balance
POST /api/scan                          # codebase inventory
GET  /api/prd, /api/prd/content         # PRD meta + content
WS   prd:start / prd:answer / prd:cancel# PRD generation (streamed)
GET  /api/kane/assurance                # UCs, cover gaps, sessions, test files
POST /api/kane/ingest                   # start ingest job -> { jobId }
POST /api/kane/design                   # start design job (use-case, max)
POST /api/kane/review                   # approve derived use-cases / verdicts
POST /api/kane/testmd/run               # run one _test.md (headless, variables-file)
GET  /api/kane/job/:id                  # job state: events, questions, runEnd
POST /api/kane/job/:id/answer           # answer pause / resume checkpoint
POST /api/kane/job/:id/cancel
POST /api/kane/resume                   # resume a durable session by sid
GET  /api/kane/runs                     # collected run facts
POST /api/kane/evidence/serve           # hosted evidence-viewer URL for a pack
GET  /api/artifacts                     # list generated artifacts
POST /api/artifacts/delete
GET  /artifacts/:id/**                  # serve artifact pages (self-contained HTML)
```

## Stack

- **Backend** — Node + Express + ws + OpenAI SDK (any OpenAI-compatible endpoint)
- **Frontend** — React + Vite + Tailwind + framer-motion
- **Browser agent** — kane-cli (assurance, testmd, evidence; runs externally)
- **Output artifacts** — self-contained HTML + TailwindCSS

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

---

Published as [`@tamago-labs/unikorn`](https://www.npmjs.com/package/@tamago-labs/unikorn)
