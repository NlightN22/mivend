// What the wizard's select step holds: ticked ids, or "all records the list filter matches" (resolved by the server).
export interface MatchingSelection {
    total: number;
    criteria: Record<string, unknown>;
    signature: string;
}

export interface BulkSelection {
    ids: ReadonlySet<string>;
    matching: MatchingSelection | null;
    notice: string;
}

export type BulkSelectionPayload = { ids: string[] } | { matching: Record<string, unknown> };

export const emptySelection = (): BulkSelection => ({ ids: new Set(), matching: null, notice: '' });

export const selectionCount = (s: BulkSelection): number => s.matching?.total ?? s.ids.size;

export function selectionPayload(s: BulkSelection): BulkSelectionPayload {
    return s.matching ? { matching: s.matching.criteria } : { ids: [...s.ids] };
}

// Rows the table shows as ticked: in "all matching" mode every row of the loaded page.
export function tickedIds(s: BulkSelection, pageIds: string[]): Set<string> {
    return s.matching ? new Set(pageIds) : new Set(s.ids);
}

// The user ticked or unticked rows; any manual change leaves "all matching" mode.
export function changeRows(s: BulkSelection, next: Set<string>, pageIds: string[]): BulkSelection {
    if (!s.matching) return { ids: next, matching: null, notice: '' };
    if (next.size === 0) return emptySelection();
    if (next.size === pageIds.length && pageIds.every(id => next.has(id))) return s;
    return {
        ids: next,
        matching: null,
        notice: 'A row was unticked, so the selection of all matching records was reset.',
    };
}

export function selectAllMatching(
    s: BulkSelection,
    total: number,
    criteria: Record<string, unknown>,
): BulkSelection {
    return {
        ids: s.ids,
        matching: { total, criteria, signature: JSON.stringify(criteria) },
        notice: '',
    };
}

// A different filter or search means a different set of records: "all matching" no longer applies.
export function criteriaChanged(
    s: BulkSelection,
    criteria: Record<string, unknown>,
): BulkSelection {
    if (!s.matching || s.matching.signature === JSON.stringify(criteria)) return s;
    return {
        ids: new Set(),
        matching: null,
        notice: 'The filter changed, so the selection of all matching records was reset.',
    };
}
