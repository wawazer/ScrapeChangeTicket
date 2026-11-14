<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read these installed skill files directly (use these paths even if a same-named global skill exists):
- Core filter, always on: `antislop`: `.opencode/skills/antislop/SKILL.md`
Before starting, follow the core's "Two Usage Modes" section in strict order: explicit session instruction first, then global preference, then ask. A session instruction always wins. For a resolved mode, say `antislop active: <mode> (session override).` or `antislop active: <mode> (global preference).` once before presenting findings or making edits, using the actual mode and source. Acknowledging the user's request without naming the source does not replace this notice.
Only an explicit choice of antislop during or after selects a session mode. A request to review, audit, or avoid file edits does not select a mode; read the global preference in that case. Another skill's mode does not select antislop's mode.
If the mode is unresolved, ask during/after and end the response; wait for the answer before any UI review, planning, or concept. For read-only tasks, put the active-mode notice only at the start of the final answer, never in progress messages. For editing tasks, announce before the first edit and omit it from the final answer.
To update antislop later: `npx antislop-ai --update`, or run `npx antislop-ai` and pick Overwrite them.
<!-- antislop:end -->

# System Memory & Codebase Map

## Architecture Overview
- **Backend**: Node.js v24.21.0 (ESM), Express ^4.21.2 (`src/server.js`), Playwright automation (`src/servicenow.js`), PDFKit (`src/pdf.js`), ExcelJS (`src/excel.js`).
- **Frontend**: Vite + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui (`frontend/src/`, build output ke `public/`).
- **Proxy Provider**: 9Router (OpenAI-compatible local endpoint).

## Conventions & Rules
- **Ponytail mode**: Minimal diffs, lazy senior developer approach.
- **ServiceNow scraping rules**:
  - `nipp_nrk` <- mapped from `user_name`
  - iFrame selector: `#gsft_main`
  - User popup selector: `sys_readonly.sys_user.*`
- **Report mapping rules (PDF/Excel via `reportTicket()`)**:
  - `PIC` <- name extracted from the ticket description text (`PIC: NAMA` / `PIC Request: NAMA`, via `extractPic()`), fallback `pic` / `assigned_to`
  - `Description` (PDF row) <- CTASK title (`judul_task` / `short_description`), fallback to the long description text when the title is empty
- **AI Assistant Identity**: My name is **arisu**. I am an AI assistant using Copilot SDK in VS Code.

## Backend Files (`src/`)
| File | Role / Responsibility |
|---|---|
| `src/server.js` | Express app, API routing, static file server |
| `src/config.js` | Environment variables, credentials, timeouts, paths |
| `src/logger.js` | Structured terminal logging (levels: info, warn, error) |
| `src/store.js` | In-memory app state (scraping progress, cached tickets, settings) |
| `src/utils.js` | Date formatting, string cleaners, sleep helpers |
| `src/parsers.js` | DOM table extraction and ticket field normalization |
| `src/servicenow.js` | Playwright browser automation for ServiceNow ticket scraping |
| `src/license.js` | License key + hardware device binding verified against zevn.web.id |
| `src/pdf.js` | PDF patch release report generation (PDFKit) |
| `src/excel.js` | Excel export generator with custom styling (ExcelJS) |
| `src/ai/provider.js` | Multi-provider LLM client dispatcher (Groq, Gemini, Ollama, DeepSeek, OpenRouter) |
| `src/ai/summary.js` | Ticket executive summary generator via LLM with fallback |
| `src/ai/risk.js` | Risk analysis & deployment mitigation generator |
| `src/ai/analysis.js` | Combined multi-ticket AI analysis pipeline |
| `src/ai/duplicate.js` | Semantic duplicate & recurring issue detection with fallback |

## Frontend Views (`frontend/src/views/`)
| File | Role / Responsibility |
|---|---|
| `frontend/src/views/dashboard-view.tsx` | Overview metrics, summary cards, quick actions |
| `frontend/src/views/scrape-view.tsx` | ServiceNow scraping trigger & live progress terminal |
| `frontend/src/views/tickets-view.tsx` | Ticket list table, filters, detail drawer, AI summary & risk badges |
| `frontend/src/views/history-view.tsx` | Historical scrape runs and past execution logs |
| `frontend/src/views/reports-view.tsx` | PDF & Excel report generator controls |
| `frontend/src/views/settings-view.tsx` | ServiceNow credentials, timeouts, AI provider configuration |

## Scripts (`scripts/`)
| File | Role / Responsibility |
|---|---|
| `scripts/banner.js` | ZEVN TUI ASCII gradient banner — printed on dev/start/install/git-pull |
| `scripts/setup-hooks.js` | Auto-installs `.git/hooks/post-merge` to trigger banner on `git pull` |
| `scripts/check-memory-sync.js` | Validates AGENTS.md matches actual codebase files |

