import type { DateRangePreset } from './columnFilterTypes';

// Shared between MvColumnFilterDateRange (renders/resolves them) and any consumer needing to
// describe an already-applied date-range filter by its preset label (e.g. an "Active filters"
// chip) — kept in one place so the two can never drift (a chip showing the raw key "last7"
// instead of "Last 7 days" is exactly the bug this avoids).
export const DATE_RANGE_PRESETS: DateRangePreset[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'last7', label: 'Last 7 days' },
    { key: 'last30', label: 'Last 30 days' },
    { key: 'last90', label: 'Last 90 days' },
    { key: 'thisMonth', label: 'This month' },
    { key: 'prevMonth', label: 'Previous month' },
    { key: 'custom', label: 'Custom range' },
];

function toIso(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// Resolved fresh each call (not memoized) — "Today" must mean today whenever it's picked, not
// whenever the module happened to load.
export function resolveDateRangePreset(key: string): { from: string; to: string } {
    const today = startOfDay(new Date());
    switch (key) {
        case 'today':
            return { from: toIso(today), to: toIso(today) };
        case 'yesterday': {
            const y = addDays(today, -1);
            return { from: toIso(y), to: toIso(y) };
        }
        case 'last7':
            return { from: toIso(addDays(today, -6)), to: toIso(today) };
        case 'last30':
            return { from: toIso(addDays(today, -29)), to: toIso(today) };
        case 'last90':
            return { from: toIso(addDays(today, -89)), to: toIso(today) };
        case 'thisMonth':
            return {
                from: toIso(new Date(today.getFullYear(), today.getMonth(), 1)),
                to: toIso(today),
            };
        case 'prevMonth': {
            const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const end = new Date(today.getFullYear(), today.getMonth(), 0);
            return { from: toIso(start), to: toIso(end) };
        }
        default:
            return { from: '', to: '' };
    }
}
