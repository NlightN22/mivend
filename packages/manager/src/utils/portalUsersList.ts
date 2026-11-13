import type { FilterCondition } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import type { CardTabSort } from '../composables/useCardTabList';
import { dateConditionRange } from './dateConditionRange';

export interface PortalUserRow {
    [key: string]: unknown;
    id: string;
    name: string;
    email: string;
    portalRole: string | null;
    active: boolean;
    createdAt: string;
}

export const PORTAL_USER_STATUSES = ['active', 'deactivated'] as const;

function matchesSelect(
    conditions: FilterCondition[],
    columnKey: string,
    actual: string | null,
): boolean {
    return conditions
        .filter(c => c.columnKey === columnKey && typeof c.value === 'string')
        .every(c => (c.operator === 'notEq' ? actual !== c.value : actual === c.value));
}

// The list is one customer's own portal logins, a small set, so filtering runs here, not on the server.
export function filterPortalUsers(
    rows: PortalUserRow[],
    search: string,
    conditions: FilterCondition[],
): PortalUserRow[] {
    const term = search.trim().toLowerCase();
    const range = dateConditionRange(conditions, 'createdAt');
    const from = range.from ? Date.parse(range.from) : -Infinity;
    const to = range.to ? Date.parse(range.to) : Infinity;
    return rows.filter(row => {
        if (term && !`${row.name} ${row.email}`.toLowerCase().includes(term)) return false;
        const created = Date.parse(row.createdAt);
        if (created < from || created >= to) return false;
        const status = row.active ? 'active' : 'deactivated';
        return (
            matchesSelect(conditions, 'portalRole', row.portalRole) &&
            matchesSelect(conditions, 'status', status)
        );
    });
}

export function sortPortalUsers(rows: PortalUserRow[], sort: CardTabSort): PortalUserRow[] {
    const key = (row: PortalUserRow): string | number =>
        sort.field === 'createdAt'
            ? Date.parse(row.createdAt)
            : sort.field === 'portalRole'
              ? (row.portalRole ?? '')
              : row.name;
    const direction = sort.dir === 'ASC' ? 1 : -1;
    return [...rows].sort((a, b) => {
        const x = key(a);
        const y = key(b);
        const cmp =
            typeof x === 'number' && typeof y === 'number'
                ? x - y
                : String(x).localeCompare(String(y));
        return cmp * direction || a.id.localeCompare(b.id);
    });
}
