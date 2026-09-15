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

| Date                     | Commit | Frontend | Page | Mode | Requests | Transferred | Notes |
| ------------------------ | ------ | -------- | ---- | ---- | -------- | ----------- | ----- |
| _(none yet — see below)_ |        |          |      |      |          |             |       |

**Not yet measured against a real deploy.** Issue #115 built the production Docker images and
confirmed they build/serve statically correctly, but did not spin up the full
`docker-compose.yml` production stack (would compete with this box's already-running `make dev`/
`make dev-staging-integration` stacks for shared ports — see the `dev-environment` skill) or run
a real Playwright measurement against it. **First real baseline entries are the next concrete
step**, once there's a production deploy (or a dedicated local `prod-up` run with no
conflicting dev stack) to point Playwright at.

## When to re-run

- After this table has its first real baseline entries.
- After any change likely to affect load time: a new heavy dependency, a `manualChunks` change,
  a new page added to a control set's own bundle, a proxy/nginx config change.
- Not on every unrelated PR — this is a targeted check, not part of `make test`/CI.
