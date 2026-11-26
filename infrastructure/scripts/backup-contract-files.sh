#!/usr/bin/env bash
# Archives the contract-files volume (scans exist only there) next to the database dump.
set -euo pipefail

project=${1:?compose project name}
outdir=${2:?output directory}
volume="${project}_contract-files"

docker volume inspect "$volume" >/dev/null
mkdir -p "$outdir"
target="$outdir/contract-files-$(date +%Y%m%d-%H%M%S).tgz"
docker run --rm -v "$volume:/v:ro" alpine tar czf - -C /v . >"$target.tmp"
mv "$target.tmp" "$target"
echo "$target"
