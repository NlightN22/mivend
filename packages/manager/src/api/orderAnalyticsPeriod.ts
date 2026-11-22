export interface PeriodDates {
    from: string;
    to: string;
}

const startOfDay = (isoDate: string): Date => new Date(`${isoDate}T00:00:00`);

// `to` is a date the viewer picked as the last day; the service takes an exclusive instant.
export function periodInstants(params: PeriodDates): {
    from: string;
    to: string;
} {
    const to = startOfDay(params.to);
    to.setDate(to.getDate() + 1);
    return { from: startOfDay(params.from).toISOString(), to: to.toISOString() };
}

export function isValidPeriod(params: PeriodDates): boolean {
    const from = startOfDay(params.from).getTime();
    const to = startOfDay(params.to).getTime();
    return Number.isFinite(from) && Number.isFinite(to) && from <= to;
}
