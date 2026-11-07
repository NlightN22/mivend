import type { FilterCondition, FilterValue } from '@mivend/ui-kit';
import type { SavedTableView } from '../api/tableViews';

// The filters of every list: the search term, the quick-filter chip and the Filter builder conditions.
export interface TableViewFilters {
    search: string;
    view: string;
    conditions: FilterCondition[];
}

// What a view remembers.
export interface TableViewState {
    filters: TableViewFilters;
    sort: { field: string; dir: 'ASC' | 'DESC' };
    columnOrder: string[];
    hiddenColumns: string[];
}

export interface StoredTableView {
    id: string;
    name: string;
    shared: boolean;
    isDefault: boolean;
    state: TableViewState;
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(v => typeof v === 'string');
}

function isCondition(value: unknown): value is FilterCondition {
    if (typeof value !== 'object' || value === null) return false;
    const c = value as Record<string, unknown>;
    const v = c.value as FilterValue;
    return (
        typeof c.columnKey === 'string' &&
        typeof c.operator === 'string' &&
        (typeof v === 'string' || isStringArray(v))
    );
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
    const filters = r.filters as Record<string, unknown> | null;
    if (!filters || typeof filters.search !== 'string' || typeof filters.view !== 'string')
        return null;
    if (!Array.isArray(filters.conditions) || !filters.conditions.every(isCondition)) return null;
    if (!sort || typeof sort.field !== 'string' || (sort.dir !== 'ASC' && sort.dir !== 'DESC'))
        return null;
    if (!isStringArray(r.columnOrder) || !isStringArray(r.hiddenColumns)) return null;
    return {
        filters: {
            search: filters.search,
            view: filters.view,
            conditions: filters.conditions,
        },
        sort: { field: sort.field, dir: sort.dir },
        columnOrder: r.columnOrder,
        hiddenColumns: r.hiddenColumns,
    };
}

export function toStoredView(view: SavedTableView): StoredTableView | null {
    const state = parseTableViewState(view.filters);
    return state
        ? {
              id: view.id,
              name: view.name,
              shared: view.scope === 'SHARED',
              isDefault: view.isDefault,
              state,
          }
        : null;
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

// What a stored choice means: nothing remembered, an explicit "built-in default", or a view id.
export const BUILT_IN_CHOICE = 'none';

// Link filters are handled by the caller; here: the person's own choice beats the team default.
export function initialViewId(views: StoredTableView[], remembered: string): string {
    if (remembered === BUILT_IN_CHOICE) return '';
    if (views.some(v => v.id === remembered)) return remembered;
    return views.find(v => v.isDefault)?.id ?? '';
}
