# Frontend load-time benchmarks

Repeatable methodology + a running log of control-page load measurements for
`packages/storefront`/`packages/manager`, so a claim like "the production build is faster" (or a
future regression) is backed by a real number, not a guess — see issue #115.

**`curl` timings against localhost are not a valid measurement here** — confirmed directly during
#115/#78's investigation: a bare `curl -o /dev/null` round-trip on localhost is dominated by
near-zero network latency and measures nothing about real parse/execute/render time or a real
network's round-trip cost. Every entry below must come from a real browser load (Playwright),
not `curl`.

## What to measure

Per frontend, a small set of **control pages** — representative, not exhaustive:

- **manager**: Dashboard (`/`), Orders list (`/orders`), Customer detail (`/customers/:id`)
- **storefront**: Home (`/`), Catalog (`/catalog`), Product detail (`/products/:id`)

For each control page, capture:

- Total requests, total transferred bytes (compressed)
- Time to first byte of the HTML shell
- Time to first render / time to interactive (whichever Playwright can report reliably —
  `page.goto` resolution time plus a check for the page's own real content, not just the shell,
  is an acceptable proxy if a proper TTI metric isn't easily available)

## How to measure

Use Playwright (`packages/e2e`'s existing tooling, or the `run-manager` skill's
`packages/e2e/manual-driver.mjs` as a starting point for manager) with the browser's own network
timing APIs — not `curl`. A minimal approach:

```js
const client = await page.context().newCDPSession(page);
await client.send('Network.enable');
const requests = [];
client.on('Network.responseReceived', e => requests.push(e));
await page.goto(url, { waitUntil: 'networkidle' });
// requests.length, sum of encodedDataLength, timing deltas
```

Run each control page **3 times** and record the median — a single run is noisy (cold caches,
box load, first-hit dependency pre-bundling in dev mode).

## Baseline log

Record every real measurement run here — frontend, mode (dev server vs. production
container), commit SHA, date, and the numbers. Never overwrite a prior entry; append.

| Date       | Commit    | Frontend   | Page                        | Mode                                                                | Requests | Transferred | Notes                   |
| ---------- | --------- | ---------- | --------------------------- | ------------------------------------------------------------------- | -------- | ----------- | ----------------------- |
| 2026-09-15 | `373794d` | manager    | `/` (unauthenticated shell) | prod container (nginx, `--network host` vs local dev backend :3000) | 14       | 2385.6 KB   | `networkidle` in 1064ms |
| 2026-09-15 | `373794d` | manager    | `/` (unauthenticated shell) | dev server (`vite`, port 5174, local contour)                       | 210      | 11091.2 KB  | `networkidle` in 3515ms |
| 2026-09-15 | `373794d` | storefront | `/` (unauthenticated shell) | prod container (nginx, `--network host` vs local dev backend :3000) | 24       | 1799.3 KB   | `networkidle` in 1709ms |
| 2026-09-15 | `373794d` | storefront | `/` (unauthenticated shell) | dev server (`vite`, port 5173, local contour)                       | 234      | 11567.1 KB  | `networkidle` in 3875ms |

**Method used for the entries above**: a one-off Playwright script (CDP `Network.enable`, counting
`Network.responseReceived` and summing `loadingFinished.encodedDataLength`), single run each — not
yet the "3 runs, take the median" rule above, this was a quick sanity check to unblock the "is this
actually faster" question, not the final rigorous methodology run. Ran the images built from this
session's own commits via `docker run --network host` — this box's real nginx already owns ports
80/443, and a bridge-network container could not reach the host's backend at all (`localhost`
resolved to `::1` inside the container and the connection just hung; `127.0.0.1` explicitly, or
`--network host`, both fixed it). The real `docker-compose.yml` deploy hits neither problem —
containers reach `server` by its compose service name on the shared compose network. Only the
unauthenticated shell was measured (same page both modes) — login-gated pages with real seeded
data (Orders list, Customer detail, Catalog, Product detail) were not measured this round.

**Result: the production build is a large, real improvement, confirmed on this box alone** —
roughly 15x fewer requests and 4-6x less data transferred, `networkidle` in about a third the
time. All of this is on localhost (near-zero latency per request) — the gap should be
considerably larger over a real network connection, given dev mode's 200+ individual round trips
vs. prod's ~15-25.

**Still not done**: a proper 3-run-median measurement against real seeded/authenticated control
pages, and a measurement against an actual deployed `docker-compose.yml` stack (not just an ad hoc
`docker run --network host`) — this round proved the concept and the direction, not the final
numbers.

## When to re-run

- After this table has its first real baseline entries.
- After any change likely to affect load time: a new heavy dependency, a `manualChunks` change,
  a new page added to a control set's own bundle, a proxy/nginx config change.
- Not on every unrelated PR — this is a targeted check, not part of `make test`/CI.
