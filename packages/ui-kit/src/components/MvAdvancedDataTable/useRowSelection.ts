import { computed } from 'vue';

// Selection spans only the loaded page (bulk select across pages is tracked in #136).
export function useRowSelection<TRow extends Record<string, unknown>>(opts: {
    rows: () => TRow[];
    dataKey: () => string;
    selectedIds: () => Set<string>;
    rowSelectable: () => (row: TRow) => boolean;
    onChange: (ids: Set<string>) => void;
}) {
    function rowId(row: TRow): string {
        return String(row[opts.dataKey()]);
    }

    function isRowSelected(row: TRow): boolean {
        return opts.selectedIds().has(rowId(row));
    }

    function toggleRowSelected(row: TRow): void {
        if (!opts.rowSelectable()(row)) return;
        const next = new Set(opts.selectedIds());
        const id = rowId(row);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        opts.onChange(next);
    }

    const selectablePageRows = computed(() => opts.rows().filter(r => opts.rowSelectable()(r)));

    const headerCheckboxState = computed<{ checked: boolean; indeterminate: boolean }>(() => {
        const selectable = selectablePageRows.value;
        if (selectable.length === 0) return { checked: false, indeterminate: false };
        const selectedCount = selectable.filter(isRowSelected).length;
        return {
            checked: selectedCount === selectable.length,
            indeterminate: selectedCount > 0 && selectedCount < selectable.length,
        };
    });

    function toggleSelectAllOnPage(): void {
        const next = new Set(opts.selectedIds());
        if (headerCheckboxState.value.checked) {
            for (const row of selectablePageRows.value) next.delete(rowId(row));
        } else {
            for (const row of selectablePageRows.value) next.add(rowId(row));
        }
        opts.onChange(next);
    }

    function resetSelection(): void {
        opts.onChange(new Set());
    }

    return {
        isRowSelected,
        toggleRowSelected,
        selectablePageRows,
        headerCheckboxState,
        toggleSelectAllOnPage,
        resetSelection,
    };
}
