# Deployment sizing

Status: **provisional.** The compose memory limits give an upper bound; real idle/peak figures
are not measured yet (see "Measurement method"). Do not send the request in `docs/ops-request.md`
as final until the table below is filled in.

## Image sizes (built from this repo, `make docker-build`)

| Image      | On disk | Compressed |
| ---------- | ------- | ---------- |
| server     | 2.83 GB | ~550 MB    |
| storefront | 83 MB   | 23 MB      |
| manager    | 83 MB   | 23 MB      |
| dashboard  | 85 MB   | 24 MB      |
| rabbitmq   | 277 MB  | -          |
| postgres   | 419 MB  | -          |
| garage     | 33 MB   | -          |

The server image carries Chromium for PDF rendering, which is most of its size. Elasticsearch
(optional) adds about 1.3 GB.

## Measured (first run, EMPTY catalog)

Method: full production compose on the development host, project `mivend-measure`, freshly
migrated database with only bootstrap data (the ERP import is closed in production, so no
catalog could be loaded through the supported path). Idle = 60 s after all services healthy.
Load = 400 `products(take: 20)` shop-api requests, 10 in parallel, through the storefront
nginx (4.4 s). The host was shared (load average 4-14), so CPU figures are indicative only.

| Service      | Idle CPU | Idle RAM | Peak CPU (load) | Peak RAM |
| ------------ | -------- | -------- | --------------- | -------- |
| server       | 0.3%     | 181 MiB  | 151%            | 222 MiB  |
| worker       | 6%       | 151 MiB  | 4%              | 152 MiB  |
| worker-email | 2%       | 136 MiB  | 1%              | 136 MiB  |
| postgres     | 5%       | 54 MiB   | 24%             | 76 MiB   |
| rabbitmq     | 1%       | 118 MiB  | 105% (brief)    | 169 MiB  |
| garage       | 0%       | 7 MiB    | 6%              | 7 MiB    |
| elasticsearch (optional) | - | 986 MiB (heap 512m) | - | - |
| storefront / manager / dashboard (nginx) | 0% | 7 MiB each | 10% | 9 MiB |

Disk after first start: postgres volume 75 MB, garage 1.3 MB, rabbitmq 0.2 MB.
Startup: postgres, rabbitmq and garage healthy in about 10 s; migrations about 1 min; server
first boot (role and payment-method provisioning) about 100 s to healthy, a restart about 15 s.

**Not measured yet:** a realistic catalog and order history, the large-cart scenario (200
lines, about 12 s per mutation expected, see `docs/pricing.md`), photo storage growth, and
Elasticsearch. Postgres and server memory will grow with the catalog; the limits below leave room.

## Upper bound from configured limits

server 2 GB + worker 2 GB + worker-email 1 GB + postgres 2 GB + rabbitmq ~0.5 GB + garage and
three nginx ~0.4 GB (+ elasticsearch 1 GB if the internal search backend is used) + OS 1 GB:
about 9-10 GB worst case. Observed idle total is under 1 GB (about 2 GB with Elasticsearch). Provisional request: **4 vCPU,
8 GB RAM (12 GB with Elasticsearch), 100 GB SSD** (images about 4 GB, database and photos grow
from there, plus room for dumps and log rotation).

Repeat the measurement on a clean box with a seeded catalog before treating this as final.
