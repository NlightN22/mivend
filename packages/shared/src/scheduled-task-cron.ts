// Shared by every plugin's `*.scheduled-task.ts` (backend-plugin-rules skill's "Recurring/
// periodic work" section) — building a 6-field cron string for a plain "every N ms" interval.
//
// Real, confirmed-live bug this fixes (issue #80 final audit): a naive `*/${seconds} * * * * *`
// breaks for any interval over 60s — croner (the cron lib @vendure/core's ScheduledTask uses)
// rejects a step greater than a field's own max value (60 for both the seconds and minutes
// fields) with `CronPattern: Syntax error, steps cannot be greater than maximum value of part
// (60)`. That throw happens inside SchedulerService.onApplicationBootstrap, which is not
// per-task try/caught — one bad schedule string (e.g. session-management's hourly
// CLEANUP_POLL_INTERVAL_DEFAULT = 3600_000ms → `*/3600 * * * * *`) crash-loops the ENTIRE
// scheduler bootstrap, in both the server and worker process, taking down every other plugin's
// ScheduledTask with it — confirmed live against a clean `make dev`, server never opened its
// port. Cascading down to the minutes/hours field for anything over 60s keeps every step at or
// below that same field's max (a step of exactly 60 is valid — only *greater than* 60 throws).
export function cronEveryMs(ms: number): string {
    const totalSeconds = Math.max(1, Math.round(ms / 1000));
    if (totalSeconds <= 60) {
        return `*/${totalSeconds} * * * * *`;
    }
    const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
    if (totalMinutes <= 60) {
        return `0 */${totalMinutes} * * * *`;
    }
    const totalHours = Math.max(1, Math.round(totalMinutes / 60));
    return `0 0 */${Math.min(totalHours, 23)} * * *`;
}
