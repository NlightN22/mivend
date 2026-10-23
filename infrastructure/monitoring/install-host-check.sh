#!/usr/bin/env bash
# Installs the hourly host-check systemd timer (disk and memory alerts); run as root from the stack
# directory. The alert is mailed through the borgmatic container, so install the backup first.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/host-check.sh"
chmod +x "$SCRIPT"

cat >/etc/systemd/system/host-check.service <<UNIT
[Unit]
Description=Host disk and memory check
After=docker.service

[Service]
Type=oneshot
Environment=DISK_MAX_PERCENT=80
Environment=MEM_MIN_MB=500
Environment=APPRISE_CONTAINER=backup-borgmatic-1
ExecStart=$SCRIPT
UNIT

cat >/etc/systemd/system/host-check.timer <<'UNIT'
[Unit]
Description=Hourly host disk and memory check

[Timer]
OnCalendar=hourly
RandomizedDelaySec=5m
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now host-check.timer >/dev/null
systemctl list-timers host-check.timer --no-pager | head -3
