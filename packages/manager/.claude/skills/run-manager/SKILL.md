---
name: run-manager
description: Run, drive, and screenshot the mivend manager portal (Vue 3 + Vite, packages/manager) — log in as a seeded test account, navigate to a page, take a screenshot, and check for console/page errors. Use when asked to run/start the manager portal, take a screenshot of a manager page, verify a manager-portal fix works in the browser, or debug a "click does nothing" style UI bug there. Not for the real automated e2e suite (`make e2e`) — this is for manual/exploratory driving during a session.
---

All paths below are relative to the repo root (`/projects/mivend`), not to this skill directory.

This is a manual/exploratory driver, not the real e2e suite. Drive the manager portal via
`packages/e2e/manual-driver.mjs` — a small Playwright script that logs in, navigates, and
screenshots. It must physically live under `packages/e2e/` (see "Why the driver lives in
packages/e2e" below), not inside this skill directory, even though this skill is about
`packages/manager`.

## Prerequisites: the dev stack must already be running

This project's dev stack (server, storefront, manager, plugin watchers, Docker infra) is managed
exclusively via `make dev`/`make up`/`make down` — see the `dev-environment` skill for the full
rules (don't duplicate them here). Before driving anything:

```bash
pgrep -f "ts-node-dev|tsc -b|tsc --watch|vite" | wc -l
```

- **Non-zero** → something is already running. Assume it's a live `make dev` stack (yours or the
  user's) and drive it as-is. Do **not** call `make dev` again on top of it, and do not call
  `make down`.
- **Zero** → start it yourself with `make dev` (see the `dev-environment` skill), then wait for it
  to actually serve before driving:

```bash
timeout 30 bash -c 'until curl -sf http://localhost:5174 >/dev/null; do sleep 1; done'
```

The manager portal serves on **`http://localhost:5174`** (`packages/manager/vite.config.ts`'s
`port: 5174`) — not 5173 (that's the storefront) and not 3000 (that's the Vendure server).

## Why the driver lives in packages/e2e

`@playwright/test` and its downloaded browsers (`~/.cache/ms-playwright`) are already installed —
they're a real dependency of `packages/e2e`, not a global `chromium-cli`-style tool. Node
resolves a bare import like `@playwright/test` relative to the **importing file's own location**,
not the current working directory — a script placed under `packages/manager/` (or run with `cwd`
there) fails with `ERR_MODULE_NOT_FOUND` / `Cannot find package '@playwright/test'` regardless of
where you invoke `node` from. Confirmed directly this session: the same one-line `import(...)`
succeeds from a file under `packages/e2e/` and fails from a file under `packages/manager/`, even
with `cwd` set to `packages/e2e`. So the driver is graduated into `packages/e2e/manual-driver.mjs`
from the start, not as an afterthought — this `SKILL.md` just points at it.

It's deliberately **not** a `.spec.ts` file and won't be picked up by `make e2e` — that command's
`playwright.config.ts` only matches `**/*.spec.ts` under `./manager`/`./storefront` project
`testDir`s.

## Run (agent path)

```bash
node packages/e2e/manual-driver.mjs --path /orders --screenshot /tmp/claude-scratch/out.png
```

Verified working this session — logs in as the portal admin, navigates to `/orders`, and produces
a real screenshot showing live seeded data (order rows, KPI tiles, etc.), with no console/page
errors reported.

Options:

| flag                   | default        | meaning                                                                                                                                                     |
| ---------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--path <path>`        | `/`            | route to navigate to after login, e.g. `/customers/1`, `/orders`                                                                                            |
| `--screenshot <file>`  | _(none)_       | absolute path to save a screenshot to; omit to skip                                                                                                         |
| `--account <key>`      | `portalAdmin`  | which seeded account to log in as — see table below                                                                                                         |
| `--wait <ms>`          | `1000`         | fixed wait after navigation before the screenshot (bump this for slower-loading pages/tables)                                                               |
| `--width` / `--height` | `1440` / `900` | viewport size — keep ≥ 800px wide unless you're specifically testing the mobile breakpoint (`MvAppTopbar`/`MvAppMobileNav`'s own `max-width: 800px` switch) |
| `--viewport-only`      | _(off)_        | screenshot only the viewport instead of the full scrollable page                                                                                            |

Test accounts (all seeded by `make seed-access-roles && make seed`, password `Password123!` for
all four — same accounts `packages/e2e/global-setup.ts` itself logs in with):

| `--account` key         | email                       | role                                                                |
| ----------------------- | --------------------------- | ------------------------------------------------------------------- |
| `operator`              | ivan.operator@mivend.dev    | operator                                                            |
| `manager`               | petr.manager@mivend.dev     | manager                                                             |
| `departmentHead`        | olga.depthead@mivend.dev    | department head                                                     |
| `portalAdmin` (default) | anna.portaladmin@mivend.dev | portal admin — broadest access, good default for exploratory checks |

The Vendure Admin API superadmin (`superadmin`/`superadmin`) is a separate account, only relevant
if you need to hit the Admin API directly (e.g. via `adminGql` helpers in `packages/e2e/helpers`)
— it does not log into this manager-portal login form.

**Always look at the screenshot** (`Read` the PNG) — a blank frame or a login page still showing
means something didn't work, even if the script exits with no error.

## Beyond a screenshot: checking console/page errors

The driver already prints `console.error`/`pageerror` output after navigation — read it. A page
can render its shell while a data fetch silently 500s.

## Test

```bash
make e2e
```

Requires `make dev` + `make seed` first (see `docs/e2e-testing.md`). This is the real, CI-relevant
suite — the driver above is for one-off manual checks during a session, not a substitute.

---

## Gotchas

- **Default filters can hide all the data you're trying to look at.** The Orders page defaults its
  "Date range" filter to "Last 7 days" — seeded fixture order dates are relative to when `make
seed` last ran, not to "now," so a table can show **0 rows** (or far fewer than expected) purely
  because of this filter, looking like a broken page when it isn't. Before asserting on table
  contents, widen the relevant filter first, e.g.:

    ```js
    const dateSelect = page
        .locator('select')
        .filter({ has: page.locator('option', { hasText: 'Last 7 days' }) });
    await dateSelect
        .first()
        .selectOption({ label: 'All time' })
        .catch(() => {});
    ```

    (`manual-driver.mjs` doesn't do this automatically — it's page-specific. Add it inline in a
    throwaway script built on top of the driver's `login()`/navigation pattern if you need it.)

- **A click that "does nothing" needs lower-level tools than a screenshot.** A real bug found this
  session: a leftover capture-phase `@click.capture` handler on an ancestor `<div>` was silently
  calling `event.stopPropagation()` before a button's own click listener ever ran — the button was
  visibly correct, `elementFromPoint` confirmed it was the top element at the click coordinates,
  and Playwright's `.click()` reported success, yet nothing happened. A screenshot alone can't
  catch this class of bug. What worked:

    1. **Confirm the click event physically happens** at the right coordinates:
        ```js
        await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, { x, y });
        ```
    2. **Check whether the target DOM node actually has a listener attached**, via a CDP session
       (not via `ElementHandle` — get an `objectId` through `Runtime.evaluate` instead):
        ```js
        const client = await page.context().newCDPSession(page);
        const { result } = await client.send('Runtime.evaluate', {
            expression: `document.querySelector('<selector>')`,
        });
        const { listeners } = await client.send('DOMDebugger.getEventListeners', {
            objectId: result.objectId,
        });
        console.log(listeners.map(l => ({ type: l.type, useCapture: l.useCapture })));
        ```
        If `useCapture: true` shows up on an ancestor for the same event type, that's a prime suspect
        for swallowing the event before it reaches your target.
    3. **Rule out a DOM-replacement race** (element re-rendered between resolving the locator and the
       actual click) with a `MutationObserver` counting mutations across the click.
    4. Add a temporary `console.log` inside the actual handler function and re-run — if it never
       fires despite step 1 showing the click landed correctly, the propagation path (not the handler
       logic) is the bug.

## Troubleshooting

- **`Cannot find package '@playwright/test'` / `ERR_MODULE_NOT_FOUND`**: the script (or whatever
  file is doing the `import`) isn't physically located under `packages/e2e/`. Node resolves bare
  imports relative to the importing file's path, not `cwd` — moving/copying the script elsewhere
  (e.g. a scratchpad tmp dir) breaks this even if you `cd packages/e2e` first. Keep it under
  `packages/e2e/`.
- **Login form fields not found**: confirm the dev stack is actually up and serving on 5174
  (`curl -sf http://localhost:5174`) — a stale/crashed dev server can leave the port open with a
  half-started Vite process that never serves the real app.
