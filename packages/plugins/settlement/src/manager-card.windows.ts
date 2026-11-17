import { processTimeZone } from './counterparty-metrics.windows';

export interface DayRange {
    from: string;
    to: string;
}

export interface ManagerCardPeriods {
    today: string;
    last30: DayRange;
    prev30: DayRange;
    mtd: DayRange;
    prevMonth: DayRange;
    prevYearMonth: DayRange;
    ytd: DayRange;
    prevYtd: DayRange;
    last12: DayRange;
}

const DAY_MS = 86_400_000;

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const utc = (day: string): number => Date.parse(`${day}T00:00:00Z`);

export const addDays = (day: string, days: number): string => iso(utc(day) + days * DAY_MS);

// Same calendar day `months` earlier, clamped to the month end (29 Feb a year back is 28 Feb).
export function shiftMonths(day: string, months: number): string {
    const d = new Date(utc(day));
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
    const last = new Date(
        Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
    ).getUTCDate();
    target.setUTCDate(Math.min(d.getUTCDate(), last));
    return iso(target.getTime());
}

export const localDay = (now: Date, timeZone: string = processTimeZone()): string =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);

export function managerCardPeriods(now: Date, timeZone?: string): ManagerCardPeriods {
    const today = localDay(now, timeZone);
    const monthStart = (day: string): string => `${day.slice(0, 7)}-01`;
    const prevMonthToday = shiftMonths(today, -1);
    const prevYearToday = shiftMonths(today, -12);
    return {
        today,
        last30: { from: addDays(today, -29), to: today },
        prev30: { from: addDays(today, -59), to: addDays(today, -30) },
        mtd: { from: monthStart(today), to: today },
        prevMonth: { from: monthStart(prevMonthToday), to: prevMonthToday },
        prevYearMonth: { from: monthStart(prevYearToday), to: prevYearToday },
        ytd: { from: `${today.slice(0, 4)}-01-01`, to: today },
        prevYtd: { from: `${prevYearToday.slice(0, 4)}-01-01`, to: prevYearToday },
        last12: { from: addDays(shiftMonths(today, -12), 1), to: today },
    };
}
