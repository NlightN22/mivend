import { ref, watch, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import { toFilterColumns } from '@mivend/ui-kit/src/components/MvAdvancedDataTable/advancedDataTableTypes';
import {
    fetchEntityVersionsForRefs,
    type EntityRef,
    type EntityVersionRow,
} from '../api/history';
import {
    HISTORY_DEFAULT_SORT,
    NO_HISTORY_OPTIONS,
    buildHistoryColumns,
} from '../components/history/historyColumns';
import { toHistoryOptions } from '../components/history/historyFilter';
import { useCardTabList, type CardTabListState } from './useCardTabList';

export interface EntityHistoryList extends CardTabListState {
    items: Ref<EntityVersionRow[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    reload: () => void;
}

// All filtering, paging and search run on the server, on top of the scope-checked refs.
export function useEntityHistoryList(getRefs: () => EntityRef[], urlPrefix: string): EntityHistoryList {
    const items = ref<EntityVersionRow[]>([]);
    const totalItems = ref(0);
    const failed = ref(false);

    const { loading, run } = useLatestRequest(
        async () => {
            try {
                return await fetchEntityVersionsForRefs(getRefs(), {
                    ...toHistoryOptions(state.search.value, state.conditions.value),
                    take: state.pageSize.value,
                    skip: (state.page.value - 1) * state.pageSize.value,
                });
            } catch (e) {
                console.warn('[history] could not load the list:', e);
                return null;
            }
        },
        result => {
            failed.value = result === null;
            items.value = result?.items ?? [];
            totalItems.value = result?.totalItems ?? 0;
        },
    );
    const reload = (): void => void run();

    const state = useCardTabList({
        urlPrefix,
        filterColumns: toFilterColumns(buildHistoryColumns(NO_HISTORY_OPTIONS)),
        sortFields: [],
        defaultSort: HISTORY_DEFAULT_SORT,
        onChange: reload,
    });
    watch(getRefs, () => {
        state.page.value = 1;
        reload();
    });
    reload();

    return { ...state, items, totalItems, loading, failed, reload };
}
