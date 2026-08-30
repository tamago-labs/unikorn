# Unikorn PRD

> Unikorn turns any codebase into a full product package — PRD, one-pager, tutorial — verified by Kane CLI.

## 1. Overview

Today AI can write code, but a product needs more than software — it needs a PRD, positioning, a marketing one-pager, a tutorial. Unikorn is the CLI that orchestrates AI (OpenAI-compatible) and Kane CLI to generate all of it from your codebase, then verify every claim traces back to real code. You give it a folder, it gives you everything else.

## 2. Users

- **Solo Founder** — built a product with AI help, now needs the PRD, pitch deck, and tutorial to show investors, co-founders, or customers. Doesn't want to write docs by hand.

## 3. Use Cases & Acceptance Criteria

### UC-1: Ingest codebase folder
- **AC-1.1:** Given a local folder path, when the user submits it, then Unikorn scans the codebase and returns a structured inventory: framework, routes, API endpoints, key features, and README summary.
- **AC-1.2:** Given an invalid or empty folder, then the CLI shows a clear error and does not proceed to generation.

### UC-2: Draft PRD from codebase
- **AC-2.1:** Given the codebase inventory, when generation is triggered, then the AI (OpenAI-compatible) produces a PRD with: overview, users, use cases, and non-goals.
- **AC-2.2:** Given the PRD is drafted, then every claim is tagged with its source (code file path or "AI-generated, unverified").

### UC-3: Verify claims against code
- **AC-3.1:** Given a drafted PRD, when verification runs, then Kane CLI checks each code-traceable claim against the actual codebase and marks it proved/unproved.
- **AC-3.2:** Given a claim is unproved, then the UI flags it with the reason and suggests a correction.

### UC-4: Generate marketing one-pager
- **AC-4.1:** Given a verified PRD, when one-pager generation runs, then the AI produces a one-pager with: hero statement, feature bullets derived from actual routes, and positioning.
- **AC-4.2:** Given the one-pager is generated, then it renders in the frontend.

### UC-5: Generate tutorial
- **AC-5.1:** Given a verified PRD + codebase inventory, when tutorial generation runs, then the AI produces a step-by-step tutorial for new developers or users.
- **AC-5.2:** Given the tutorial is generated, then each step is traceable to a real file or feature in the codebase.

## 4. Non-goals (v1)

- No GitHub URL ingestion — local folder only
- No real-time collaboration — single user, local session
- No user-code generation — Unikorn reads the codebase but never modifies the user's source code. Output artifacts (slides, one-pager, tutorial) are self-contained HTML + TailwindCSS
- No multi-folder / monorepo support — single codebase per run
- No custom branding/theming of outputs — clean default only

## 5. Tech Constraints

- Express + WebSocket backend (Node.js CLI server)
- Next.js frontend (App Router, TypeScript)
- OpenAI-compatible API for AI (replaces QVAC local models)
- Kane CLI for browser automation + claim verification
- `KANE_CLI_USER_AGENT=unikorn` for all Kane spawns
- Session/state persisted to `~/.unikorn/`
- Output artifacts: self-contained HTML + TailwindCSS
- Variables via `--variables-file` temp JSON, never hardcoded
