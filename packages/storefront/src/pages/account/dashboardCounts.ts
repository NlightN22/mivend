export interface MonthCount {
    count: number;
    atLeast: boolean;
}

// Documents arrive newest first; when the whole scanned page is from this month, older ones may be too.
export function countIssuedThisMonth(
    issueDates: string[],
    totalItems: number,
    now: Date,
): MonthCount {
    const count = issueDates.filter(iso => {
        const d = new Date(iso);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    return { count, atLeast: count === issueDates.length && totalItems > issueDates.length };
}

export function monthCountLabel(value: MonthCount): string {
    return value.atLeast ? `${value.count}+` : String(value.count);
}
