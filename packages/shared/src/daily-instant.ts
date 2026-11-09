// Latest `hour:00` in the process time zone (TZ) that is not after `now`.
export function lastDailyInstant(now: Date, hour: number): Date {
    const candidate = new Date(now);
    candidate.setHours(hour, 0, 0, 0);
    if (candidate.getTime() > now.getTime()) {
        candidate.setDate(candidate.getDate() - 1);
        candidate.setHours(hour, 0, 0, 0);
    }
    return candidate;
}
