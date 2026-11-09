#!/usr/bin/env python3
"""Host-level scan for busy-but-not-serving processes; detection only unless STUCK_KILL=1 (docs/environments.md).
Writes the suspects as JSON to STUCK_STATUS_FILE atomically."""
import glob
import json
import os
import re
import subprocess
import sys
import time

STATUS_FILE = os.environ.get("STUCK_STATUS_FILE", "/run/mivend-stuck-processes.json")
INTERVAL = int(os.environ.get("STUCK_INTERVAL_SECS", "30"))
CPU_PCT = int(os.environ.get("STUCK_CPU_PCT", "60"))
BUSY_SECS = int(os.environ.get("STUCK_BUSY_SECS", "600"))
COMM = re.compile(os.environ.get("STUCK_COMM", r"^(node|esbuild|vite|chrome.*|python3?)$"))
KILL = os.environ.get("STUCK_KILL") == "1"
LOG_QUIET_SECS = int(os.environ.get("STUCK_LOG_QUIET_SECS", "300"))
REPO_ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", ".."))
PGID_GLOB = os.environ.get("STUCK_PGID_GLOB", "/tmp/mivend-dev*.pgid")
CLK_TCK = os.sysconf("SC_CLK_TCK")
SELF = os.getpid()


def read_proc(pid):
    try:
        with open(f"/proc/{pid}/stat") as f:
            stat = f.read()
        comm = stat[stat.index("(") + 1 : stat.rindex(")")]
        fields = stat[stat.rindex(")") + 2 :].split()
        with open(f"/proc/{pid}/cmdline", "rb") as f:
            cmd = f.read().replace(b"\0", b" ").decode(errors="replace").strip()
        return comm, int(fields[11]) + int(fields[12]), int(fields[2]), cmd
    except (OSError, ValueError):
        return None


def listening_pids():
    try:
        out = subprocess.run(["ss", "-Hltnp"], capture_output=True, text=True).stdout
    except OSError:
        return None
    return {int(p) for p in re.findall(r"pid=(\d+)", out)}


def log_file(pid):
    try:
        path = os.readlink(f"/proc/{pid}/fd/1")
        return path if os.path.isfile(path) else None
    except OSError:
        return None


def log_tail(path, lines=20):
    try:
        with open(path, "rb") as f:
            f.seek(max(os.fstat(f.fileno()).st_size - 8000, 0))
            return f.read().decode(errors="replace").splitlines()[-lines:]
    except OSError:
        return []


def is_tracked(pid, pgid):
    """The group is recorded by dev-run-tracked.sh, the file is trusted, and a member still runs in this repo."""
    try:
        suspect_uid = os.stat(f"/proc/{pid}").st_uid
    except OSError:
        return False
    for path in [p for pattern in PGID_GLOB.split() for p in glob.glob(pattern)]:
        try:
            if int(open(path).read().strip()) != pgid or os.stat(path).st_uid not in (0, suspect_uid):
                continue
        except (OSError, ValueError):
            continue
        for member in os.listdir("/proc"):
            if member.isdigit() and read_proc(member) and read_proc(member)[2] == pgid:
                try:
                    if os.path.realpath(f"/proc/{member}/cwd").startswith(REPO_ROOT):
                        return True
                except OSError:
                    pass
    return False


def log_quiet(path):
    return path is not None and time.time() - os.stat(path).st_mtime >= LOG_QUIET_SECS


def write_status(suspects):
    tmp = f"{STATUS_FILE}.{SELF}.tmp"
    with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o640), "w") as f:
        json.dump({"updated": int(time.time()), "interval": INTERVAL, "stuck": suspects}, f)
    os.replace(tmp, STATUS_FILE)


def scan(state):
    now = time.time()
    listening = listening_pids()
    if listening is None:
        return []
    suspects, seen = [], set()
    for entry in os.listdir("/proc"):
        if not entry.isdigit() or int(entry) == SELF:
            continue
        pid = int(entry)
        info = read_proc(pid)
        if not info or not COMM.match(info[0]):
            continue
        _, ticks, pgid, cmd = info
        seen.add(pid)
        prev = state.get(pid)
        state[pid] = {"ticks": ticks, "at": now, "since": prev["since"] if prev else None}
        if not prev:
            continue
        cpu = (ticks - prev["ticks"]) * 100 / (CLK_TCK * max(now - prev["at"], 1))
        if cpu < CPU_PCT or pid in listening:
            state[pid]["since"] = None
            continue
        state[pid]["since"] = prev["since"] or now
        busy = int(now - state[pid]["since"])
        if busy < BUSY_SECS:
            continue
        try:
            cwd = os.readlink(f"/proc/{pid}/cwd")
        except OSError:
            cwd = ""
        log = log_file(pid)
        suspects.append({"pid": pid, "command": cmd[:300], "cwd": cwd, "cpu_percent": round(cpu),
                         "busy_seconds": busy, "listening": False, "last_log_lines": log_tail(log) if log else []})
        if KILL and log_quiet(log) and is_tracked(pid, pgid):
            try:
                os.kill(pid, 9)
            except ProcessLookupError:
                continue
            print(f"[stuck-scan] killed tracked pid {pid} (group {pgid}): {round(cpu)}% CPU for {busy}s, not listening: {cmd[:200]}", file=sys.stderr, flush=True)
    for pid in set(state) - seen:
        del state[pid]
    return suspects


def main():
    iterations = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    state, n = {}, 0
    while True:
        write_status(scan(state))
        n += 1
        if iterations and n >= iterations:
            return
        time.sleep(INTERVAL)


main()
