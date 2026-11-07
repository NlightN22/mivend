import { computed, ref, type Ref } from 'vue';
import type { DataTableState } from '../../composables/useDataTableState';
import { fitColumnWidths } from '../../utils/fitColumnWidths';
import type { AdvancedDataTableColumn } from './advancedDataTableTypes';

const SELECT_COLUMN_WIDTH = 48;

// `table-layout: fixed` makes `width` exact, so long cell content truncates instead of squeezing
// the other columns off-screen.
export function columnStyle(col: AdvancedDataTableColumn): Record<string, string> {
    const style: Record<string, string> = { width: `${col.width}px` };
    if (col.minWidth) style.minWidth = `${col.minWidth}px`;
    if (col.maxWidth) style.maxWidth = `${col.maxWidth}px`;
    return style;
}

// Order/width/visibility live in the consumer-owned `tableState`; this only reads and writes it.
export function useColumnLayout(opts: {
    columns: () => AdvancedDataTableColumn[];
    selectable: () => boolean;
    tableState: Ref<DataTableState>;
    containerWidth: Ref<number>;
}) {
    const { tableState } = opts;

    const visibleColumns = computed(() => {
        const byField = new Map(opts.columns().map(c => [c.field, c]));
        const hidden = new Set(tableState.value.hiddenColumns);
        const shown = tableState.value.columnOrder
            .filter(
                field => byField.has(field) && (!hidden.has(field) || byField.get(field)!.required),
            )
            .map(field => {
                const col = byField.get(field)!;
                return { ...col, width: tableState.value.columnWidths[field] ?? col.width };
            });
        const selectWidth = opts.selectable() ? SELECT_COLUMN_WIDTH : 0;
        const fit = fitColumnWidths(shown, opts.containerWidth.value - selectWidth);
        return shown
            .filter(c => fit.widths.has(c.field))
            .map(c => ({ ...c, width: fit.widths.get(c.field) ?? c.width }));
    });

    const columnToggleItems = computed(() =>
        tableState.value.columnOrder
            .map(field => opts.columns().find(c => c.field === field))
            .filter((c): c is AdvancedDataTableColumn => !!c)
            .map(c => ({
                key: c.field,
                label: c.header,
                required: c.required,
                visible: !!c.required || !tableState.value.hiddenColumns.includes(c.field),
            })),
    );

    function onColumnToggle(field: string): void {
        const hidden = new Set(tableState.value.hiddenColumns);
        if (hidden.has(field)) hidden.delete(field);
        else hidden.add(field);
        tableState.value.hiddenColumns = [...hidden];
    }

    function onColumnsReorder(order: string[]): void {
        tableState.value.columnOrder = order;
    }

    // PrimeVue applies a resize via a head <style> with `!important`, cleared only on unmount, so
    // bumping this key is the only way to undo a resize after "Reset columns".
    const tableRemountKey = ref(0);

    // Layout only (order/width/hidden); never filters or sort.
    function onColumnsReset(): void {
        const columns = opts.columns();
        tableState.value.hiddenColumns = [];
        tableState.value.columnOrder = columns.map(c => c.field);
        tableState.value.columnWidths = Object.fromEntries(columns.map(c => [c.field, c.width]));
        tableRemountKey.value++;
    }

    function onColumnResizeEnd(event: { element: HTMLElement; delta: number }): void {
        const headerText = event.element
            ?.querySelector('.mv-advanced-data-table__col-title')
            ?.textContent?.trim();
        const col = opts.columns().find(c => c.header === headerText);
        if (!col) return;
        const current = tableState.value.columnWidths[col.field] ?? col.width;
        let next = current + event.delta;
        if (col.minWidth) next = Math.max(next, col.minWidth);
        if (col.maxWidth) next = Math.min(next, col.maxWidth);
        tableState.value.columnWidths = { ...tableState.value.columnWidths, [col.field]: next };
    }

    return {
        visibleColumns,
        columnToggleItems,
        tableRemountKey,
        onColumnToggle,
        onColumnsReorder,
        onColumnsReset,
        onColumnResizeEnd,
    };
}
