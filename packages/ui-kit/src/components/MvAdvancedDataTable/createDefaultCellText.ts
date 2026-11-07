// Primitives render as text, null/undefined as empty; objects need a `#cell-<field>` slot.
export function createDefaultCellText(): (field: string, row: unknown) => string {
    const warnedFields = new Set<string>();
    return (field, row) => {
        const value = (row as Record<string, unknown>)[field];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') {
            if (import.meta.env.DEV && !warnedFields.has(field)) {
                warnedFields.add(field);

                console.warn(
                    `MvAdvancedDataTable: column "${field}" received an object/array value with no #cell-${field} slot — rendering empty instead of "[object Object]".`,
                );
            }
            return '';
        }
        return String(value);
    };
}
