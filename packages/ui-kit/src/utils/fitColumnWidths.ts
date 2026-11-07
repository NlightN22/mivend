export interface FitColumn {
    field: string;
    width: number;
    minWidth?: number;
    priority?: number;
    required?: boolean;
}

export const DEFAULT_MIN_COLUMN_WIDTH = 72;

// Lowest priority shrinks first (later column first on a tie), each down to its minWidth. A column
// still not fitting at its floor is dropped, lowest priority first, unless `required`.
export function fitColumnWidths(
    columns: FitColumn[],
    available: number,
): { widths: Map<string, number>; dropped: Set<string> } {
    const widths = new Map(columns.map(c => [c.field, c.width]));
    const dropped = new Set<string>();
    const total = (): number => [...widths.values()].reduce((a, b) => a + b, 0);
    if (available <= 0 || !columns.some(c => c.priority !== undefined)) return { widths, dropped };

    const order = columns
        .map((c, index) => ({ c, index }))
        .sort((a, b) => (a.c.priority ?? 0) - (b.c.priority ?? 0) || b.index - a.index)
        .map(x => x.c);

    for (const col of order) {
        const deficit = total() - available;
        if (deficit <= 0) break;
        const floor = Math.min(col.width, col.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH);
        widths.set(col.field, Math.max(floor, col.width - deficit));
    }
    for (const col of order) {
        if (total() <= available) break;
        if (col.required) continue;
        widths.delete(col.field);
        dropped.add(col.field);
    }
    return { widths, dropped };
}
