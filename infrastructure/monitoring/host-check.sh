#!/usr/bin/env bash
# Hourly host health check (issue #210): root filesystem usage and available memory. A problem is
# mailed through the Apprise already configured for the borgmatic container (APPRISE_URL lives in
# that container's environment, so no second copy of the mail credentials exists on the host).
# The same problem is re-sent at most once per ALERT_REPEAT_HOURS; a changed problem is sent at once.
# Run by host-check.timer (installed by bootstrap/monitor.sh).
set -euo pipefail

DISK_MAX_PERCENT="${DISK_MAX_PERCENT:-80}"
MEM_MIN_MB="${MEM_MIN_MB:-500}"
ALERT_REPEAT_HOURS="${ALERT_REPEAT_HOURS:-24}"
STATE_FILE="${STATE_FILE:-/var/lib/host-check/last-alert}"
APPRISE_CONTAINER="${APPRISE_CONTAINER:-backup-borgmatic-1}"
HOST="$(hostname -f 2>/dev/null || hostname)"

disk_used="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
mem_avail_mb="$(awk '/^MemAvailable:/ {print int($2 / 1024)}' /proc/meminfo)"

problems=()
[ "$disk_used" -le "$DISK_MAX_PERCENT" ] || problems+=("disk / is ${disk_used}% full (limit ${DISK_MAX_PERCENT}%)")
[ "$mem_avail_mb" -ge "$MEM_MIN_MB" ] || problems+=("only ${mem_avail_mb} MB memory available (minimum ${MEM_MIN_MB} MB)")

mkdir -p "$(dirname "$STATE_FILE")"
if [ "${#problems[@]}" -eq 0 ]; then
  rm -f "$STATE_FILE"
  exit 0
fi

body="$(printf '%s\n' "${problems[@]}")"
now="$(date +%s)"
if [ -f "$STATE_FILE" ]; then
  last_time="$(head -1 "$STATE_FILE")"
  last_body="$(tail -n +2 "$STATE_FILE")"
  # Compare the problem kinds, not the exact numbers, so a slowly growing disk does not re-alert.
  kinds() { printf '%s\n' "$1" | awk '{print $1}' | sort | tr '\n' ' '; }
  if [ "$(kinds "$last_body")" = "$(kinds "$body")" ] && [ $((now - last_time)) -lt $((ALERT_REPEAT_HOURS * 3600)) ]; then
    exit 0
  fi
fi

container="$(docker ps -q --filter "name=${APPRISE_CONTAINER}" | head -1)"
if [ -z "$container" ]; then
  echo "host-check: ${HOST}: ${body//$'\n'/; } (alert not mailed: container ${APPRISE_CONTAINER} is not running)" | systemd-cat -t host-check -p err
  exit 1
fi
docker exec "$container" sh -c 'apprise -t "$1" -b "$2" "$APPRISE_URL"' _ "${HOST_CHECK_TITLE_PREFIX:-}host problem on ${HOST}" "$body" >/dev/null
printf '%s\n%s\n' "$now" "$body" >"$STATE_FILE"
echo "host-check: alert sent for ${HOST}: ${body//$'\n'/; }" | systemd-cat -t host-check -p warning
