// croner throws on a step above the field's max (60 for seconds/minutes), and the scheduler
// bootstrap is not per-task try/caught, so one bad schedule string crashes every plugin's task.
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
