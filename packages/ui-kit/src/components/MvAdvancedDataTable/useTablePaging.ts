import { ref, watch, type Ref } from 'vue';
import type { FilterCondition } from '../MvFilterBuilder/filterBuilderTypes';
import type { DataTableState } from '../../composables/useDataTableState';

// `first` is bound to PrimeVue's paginator and reset together with `reset-page`, otherwise the
// highlighted page and the fetched page drift apart.
export function useTablePaging(opts: {
    tableState: Ref<DataTableState>;
    conditions: Ref<FilterCondition[]>;
    onResetPage: () => void;
    onPageChange: (page: number) => void;
}) {
    const { tableState } = opts;
    const first = ref(0);

    // No "skip the first call" guard: it swallowed the first real filter change.
    watch(
        [() => tableState.value.filters, opts.conditions],
        () => {
            first.value = 0;
            opts.onResetPage();
        },
        { deep: true },
    );

    // PrimeVue keeps an equivalent page on a page-size change; the project convention is page 1.
    function onPage(event: { page: number; rows: number }): void {
        const pageSizeChanged = event.rows !== tableState.value.pageSize;
        tableState.value.pageSize = event.rows;
        if (pageSizeChanged) {
            first.value = 0;
            opts.onResetPage();
        } else {
            opts.onPageChange(event.page + 1);
        }
    }

    return { first, onPage };
}
