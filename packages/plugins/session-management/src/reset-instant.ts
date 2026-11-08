interface Parts {
    year: number;
    month: number;
    day: number;
}

function partsIn(
    timeZone: string,
    at: number,
): Parts & { hour: number; minute: number; second: number } {
    const formatted = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
    }).formatToParts(new Date(at));
    const read = (type: string): number =>
        Number(formatted.find(part => part.type === type)?.value);
    return {
        year: read('year'),
        month: read('month'),
        day: read('day'),
        hour: read('hour'),
        minute: read('minute'),
        second: read('second'),
    };
}

function offsetMs(timeZone: string, at: number): number {
    const p = partsIn(timeZone, at);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - Math.floor(at / 1000) * 1000;
}

function wallClockToInstant(timeZone: string, day: Parts, hour: number): number {
    const guess = Date.UTC(day.year, day.month - 1, day.day, hour);
    const first = guess - offsetMs(timeZone, guess);
    return guess - offsetMs(timeZone, first);
}

// Latest `hour:00` wall-clock instant in `timeZone` that is not after `now`; DST-correct.
export function lastResetInstant(now: Date, hour: number, timeZone: string): Date {
    const today = partsIn(timeZone, now.getTime());
    const candidate = wallClockToInstant(timeZone, today, hour);
    if (candidate <= now.getTime()) {
        return new Date(candidate);
    }
    const previous = new Date(Date.UTC(today.year, today.month - 1, today.day - 1));
    const day = {
        year: previous.getUTCFullYear(),
        month: previous.getUTCMonth() + 1,
        day: previous.getUTCDate(),
    };
    return new Date(wallClockToInstant(timeZone, day, hour));
}
