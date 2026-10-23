#!/usr/bin/env bash
# Runs the full e2e suite as $1 shards, each on a fresh stack; the caller holds the e2e lock throughout.
set -u
shards=$1
failed=""
for i in $(seq 1 "$shards"); do
    pnpm --filter server exec ts-node --transpile-only src/__tests__/e2e-stack/run.ts \
        pnpm --filter @mivend/e2e test "--shard=$i/$shards" || failed="$failed $i"
done
if [ -n "$failed" ]; then
    echo "e2e shards failed:$failed"
    exit 1
fi
