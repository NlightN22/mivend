import type { ColumnFilterOption } from './columnFilterTypes';

export const SEARCHABLE_OPTION_COUNT = 8;

export function filterOptionsByQuery(
    options: ColumnFilterOption[],
    query: string,
): ColumnFilterOption[] {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter(o => o.label.toLowerCase().includes(needle)) : options;
}
