import type { TableRow } from '../MvTable/MvTable.vue';
import type { TableFilterFieldDef } from './MvTableFilters.vue';

// Generic client-side matcher for a row already shaped for display (i.e. the same TableRow
// passed to MvTable) against a MvTableFilters value record — 'search' fields do a
// case-insensitive substring match, 'select' fields require an exact match. Only meaningful for
// pages that hold their full row set in memory (see ApprovalsInboxPage.vue); server-paginated
// lists (e.g. Orders) must keep filtering in their GraphQL query instead.
// Autocomplete suggestions for 'search' fields, derived from whatever rows are actually in
// memory — accurate and complete for pages that load their full dataset up front (Approvals);
// for a future server-paginated table this would only ever suggest values from the currently
// loaded page, not the full remote list, so it's not a fit there without a dedicated
// suggest/autocomplete backend query. Capped per field to keep the native <datalist> usable.
const MAX_SUGGESTIONS_PER_FIELD = 25;

export function deriveFilterSuggestions(
    rows: TableRow[],
    fields: TableFilterFieldDef[],
): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const field of fields) {
        if (field.type !== 'search') continue;
        const values = new Set<string>();
        for (const row of rows) {
            const value = row[field.key];
            if (value == null) continue;
            const text = String(value).trim();
            if (text && text !== '—') values.add(text);
        }
        result[field.key] = [...values].sort().slice(0, MAX_SUGGESTIONS_PER_FIELD);
    }
    return result;
}

export function matchesTableFilters(
    row: TableRow,
    fields: TableFilterFieldDef[],
    values: Record<string, string>,
): boolean {
    return fields.every(field => {
        const value = values[field.key];
        if (!value) return true;
        const cell = String(row[field.key] ?? '').toLowerCase();
        if (field.type === 'select') return cell === value.toLowerCase();
        return cell.includes(value.toLowerCase());
    });
}
