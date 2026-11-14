export interface MetricsWindows {
    timeZone: string;
    computedAt: Date;
    endExclusive: Date;
    last30Start: Date;
    prev30Start: Date;
    last12Start: Date;
}

export const processTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

interface LocalDate {
    year: number;
    month: number;
    day: number;
}

const partsOf = (instant: number, timeZone: string): Record<string, number> => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
    }).formatToParts(new Date(instant));
    const out: Record<string, number> = {};
    for (const p of parts) if (p.type !== 'literal') out[p.type] = Number(p.value);
    return out;
};

const offsetMs = (instant: number, timeZone: string): number => {
    const p = partsOf(instant, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - Math.floor(instant / 1000) * 1000;
};

// UTC instant of local midnight; month/day may overflow and are normalised by Date.UTC.
export const localMidnight = (date: LocalDate, timeZone: string): Date => {
    const guess = Date.UTC(date.year, date.month - 1, date.day);
    const first = guess - offsetMs(guess, timeZone);
    return new Date(guess - offsetMs(first, timeZone));
};

export function computeWindows(now: Date, timeZone: string = processTimeZone()): MetricsWindows {
    const p = partsOf(now.getTime(), timeZone);
    const at = (monthShift: number, dayShift: number): Date =>
        localMidnight(
            { year: p.year, month: p.month + monthShift, day: p.day + dayShift },
            timeZone,
        );
    return {
        timeZone,
        computedAt: now,
        endExclusive: at(0, 1),
        last30Start: at(0, -29),
        prev30Start: at(0, -59),
        last12Start: at(-12, 1),
    };
}

export function averageCheck(netMinor: number, saleDocuments: number): number | null {
    return saleDocuments > 0 ? Math.round(netMinor / saleDocuments) : null;
}
