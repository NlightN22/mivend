import type { TableRow } from '../MvTable/MvTable.vue';
import type { TableFilterFieldDef } from './MvTableFilters.vue';

// Filters in memory only: server-paginated lists must filter in their GraphQL query.
// Suggestions come from loaded rows only, so they are complete only for fully loaded datasets.
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
