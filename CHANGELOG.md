# Changelog

Release tags use `vMAJOR.MINOR.PATCH`. Newest release first.

## v1.0.0 (2026-11-22)

First tagged release of ScrapeChangeTicket. Version matches `package.json`
(`servicenow-pelindo-scraper` 1.0.0).

### Scraping

- Playwright session start with manual login support for SSO and MFA instances.
- Saved filter discovery from the Change Task list, with filter selection and record estimate.
- Paginated extraction inside the `#gsft_main` iframe, with page-signature checks so pagination
  stops on a stuck page instead of looping.
- Per-ticket detail and activity extraction, with `scrape_status` and error capture per ticket.
- Duplicate-safe upserts on `nomor_tiket`, checkpoints during a run, and pause, resume, cancel.
- `nipp_nrk` mapped from the ServiceNow `user_name`.

### Reporting

- PDF patch release report (A4 portrait) with continuation pages for long Cause and Action Plan
  text, page numbering, and the Pelindo logo in the header.
- PIC resolved from the ticket description (`PIC:` or `PIC Request:`), falling back to the
  assigned user; Description column uses the CTASK title with the long text as fallback.
- XLSX export with styled header, freeze panes, autofilter, and a metadata sheet.
- Full-run JSON export.
- Evidence screenshot upload, embedded in the PDF for the selected tickets.
- Export guard: reports are refused while a scrape runs or when no ticket succeeded.

### AI

- Provider abstraction over OpenAI-compatible chat completions: Groq, Gemini, Ollama, DeepSeek,
  OpenRouter, selected with `AI_PROVIDER`.
- Ticket summary with `riskLevel` and `category`, cached in memory, with a safe fallback on
  provider or JSON failures.
- Risk analysis endpoint and duplicate detection endpoint.
- Combined multi-ticket analysis pipeline.

### Dashboard

- React 19 + Vite + Tailwind v4 SPA built into `public/`, served by Express with SPA fallback.
- Views: dashboard, scrape (live log and progress), tickets (table, detail drawer, AI badges),
  history, reports, settings for credentials, timeouts, and AI provider.
- Frontend lint via oxlint.

### Platform

- License verification with hardware device binding against `zevn.web.id`, gated API prefixes,
  and activation, deactivation, and status endpoints.
- Structured terminal logging with levels and per-ticket context.
- ZEVN banner printed on install, dev, start, and after `git pull` through a `post-merge` hook.
- `npm run check:memory` validates that `AGENTS.md` still matches the files on disk.

### Testing

- Node.js test runner suites for unit, integration, and visual checks.
- Playwright end-to-end dashboard tests.
- Live smoke script for a real ServiceNow instance.

### Notes

- `.env` is required and is not committed. See the Configuration table in `README.md`.
- Chromium must be installed with `npx playwright install chromium` before the first run.

## How to cut a release

1. Update the version in `package.json` and `frontend/package.json` if the frontend changed.
2. Move the `Unreleased` notes, if any, under the new version heading with today's date.
3. Commit, then tag:

   ```powershell
   git add CHANGELOG.md package.json
   git commit -m "chore(release): vX.Y.Z"
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin main --tags
   ```

4. Paste the new version section as the release body on the repository host.
