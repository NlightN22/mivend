---
name: check-page
description: Use to visually/functionally check whether a storefront or manager page actually renders — no Claude in Chrome extension needed, no login required for a public page. Good for "why is the page empty/broken", verifying a fix after a dev-stack restart, or a quick screenshot without asking the user to check manually. Not a replacement for packages/e2e's real auth-gated Playwright suite (make e2e) — this is a fast, fixture-free sanity check.
---

# check-page: headless Playwright sanity check

A standalone script, `packages/e2e/check-page.mjs`, that opens a URL in headless Chromium
(via this repo's existing `@playwright/test` dependency — no extra install), waits for
network-idle, and reports back console errors, failed requests, HTTP error responses, a text
preview of the rendered page, and a full-page screenshot. No login, no `storageState` fixture —
just "does this URL actually render right now."

Use this instead of asking the user to open the page and describe what they see, whenever the
question is answerable by looking at the page yourself (empty catalog, blank screen, a
suspected stale dev-server/proxy issue after a `make dev` restart, confirming a UI fix). It is
**not** a substitute for `packages/e2e`'s real Playwright suite (`make e2e`) — that covers
authenticated flows across manager-operator/manager/department-head/portal-admin roles with real
fixtures; this script has none of that and is for a quick look, not a regression suite.

## Usage

Must run with cwd = `packages/e2e` (or via `pnpm --filter @mivend/e2e exec node
check-page.mjs ...`) so Node's ESM resolver finds `@playwright/test`'s bundled `playwright`
package — running it from the repo root or via a bare absolute path fails with
`ERR_MODULE_NOT_FOUND`.

```bash
cd packages/e2e
node check-page.mjs <url> [--wait-for=<css-selector>] [--out=<path>]
```

- `<url>` — full URL, e.g. `https://devof.komponent-m.ru:8004` (local storefront, external) or
  `http://localhost:5173` (local storefront, internal) — see `docs/environments.md`'s port table
  for every contour's addresses.
- `--wait-for` — optional CSS/text selector to wait for beyond plain network-idle (Playwright
  locator syntax, e.g. `text=Full catalog`). Omit for a plain "did it load" check.
- `--out` — screenshot path (default `page-check.png` in the cwd). Use this repo's scratchpad
  directory for a one-off check, not a path inside the repo.

Output is one JSON object to stdout: `navError`, `bodyTextPreview` (first 800 chars of rendered
`<body>` text — enough to see real product names/prices vs. an empty-state message),
`consoleErrors`, `requestFailures`, `networkErrors` (any HTTP response ≥400), and the screenshot
path. Exit code is non-zero if navigation failed or any request failed outright (not merely a
40x/50x HTTP status, which is reported but doesn't itself fail the exit code).

## When the page looks broken

Check the actual backend/API first (`curl` the same GraphQL query the page sends, or check
`docker ps`/`pgrep` per the `dev-environment` skill) before assuming a frontend bug — a stale
browser tab whose Vite HMR socket died across a `make dev` restart looks identical, in a
description, to a real empty-catalog bug. `check-page.mjs` itself opens a **fresh** browser
context every run, so it never suffers that particular staleness — if it shows real data but the
user's own open tab doesn't, that's diagnostic: tell them to hard-refresh, not to debug the
backend.
