import type { SavedTableView } from '../api/tableViews';

// What a view remembers. `filters` is opaque to the storage: the table that owns the viewsKey
// shapes it, and it includes the search term.
export interface TableViewState {
    filters: Record<string, unknown>;
    sort: { field: string; dir: 'ASC' | 'DESC' };
    columnOrder: string[];
    hiddenColumns: string[];
}

export interface StoredTableView {
    id: string;
    name: string;
    state: TableViewState;
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(v => typeof v === 'string');
}

export function parseTableViewState(json: string): TableViewState | null {
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch {
        return null;
    }
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const sort = r.sort as Record<string, unknown> | null;
    if (typeof r.filters !== 'object' || r.filters === null) return null;
    if (!sort || typeof sort.field !== 'string' || (sort.dir !== 'ASC' && sort.dir !== 'DESC'))
        return null;
    if (!isStringArray(r.columnOrder) || !isStringArray(r.hiddenColumns)) return null;
    return {
        filters: r.filters as Record<string, unknown>,
        sort: { field: sort.field, dir: sort.dir },
        columnOrder: r.columnOrder,
        hiddenColumns: r.hiddenColumns,
    };
}

export function toStoredView(view: SavedTableView): StoredTableView | null {
    const state = parseTableViewState(view.filters);
    return state ? { id: view.id, name: view.name, state } : null;
}

// Keys are sorted so the same state always serializes the same way.
function canonical(value: unknown): string {
    return JSON.stringify(value, (_k, v: unknown) =>
        v && typeof v === 'object' && !Array.isArray(v)
            ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
            : v,
    );
}

export function sameTableViewState(a: TableViewState, b: TableViewState): boolean {
    return canonical(a) === canonical(b);
}

export function visibleColumnsOf(state: TableViewState): string[] {
    return state.columnOrder.filter(c => !state.hiddenColumns.includes(c));
}
