// The form's "until" is inclusive, the API's validTo is an exclusive instant: day after, local midnight.
export function periodStartIso(day: string): string | null {
    return day ? new Date(`${day}T00:00:00`).toISOString() : null;
}

export function periodEndIso(day: string): string | null {
    if (!day) return null;
    const end = new Date(`${day}T00:00:00`);
    end.setDate(end.getDate() + 1);
    return end.toISOString();
}

export function describePeriod(validFrom: string | null, validTo: string | null): string {
    if (!validFrom && !validTo) return 'Permanent';
    const fmt = (v: string): string => new Date(v).toLocaleDateString('en-GB');
    return `${validFrom ? fmt(validFrom) : 'any time'} to ${validTo ? fmt(validTo) : 'open end'}`;
}
