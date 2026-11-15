import { onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import {
    fetchPowersOfAttorney,
    type PowerOfAttorneyRow,
    type PowersOfAttorneyListFilters,
    type PowersOfAttorneySort,
} from '../api/powersOfAttorneyList';
import { useUrlSearchParam } from './useUrlSearchParam';
import { useUrlSyncedState } from './useUrlSyncedState';
import {
    POWERS_OF_ATTORNEY_URL_DEFAULTS,
    fromPowersOfAttorneyUrlState,
    toPowersOfAttorneyUrlState,
    type PowersOfAttorneyUrlState,
} from './powersOfAttorneyListUrl';

export interface PowersOfAttorneyListState {
    items: Ref<PowerOfAttorneyRow[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    reload: () => void;
    filters: Ref<PowersOfAttorneyListFilters>;
    sort: Ref<PowersOfAttorneySort>;
    counterpartyId: Ref<string>;
    page: Ref<number>;
    pageSize: Ref<number>;
}

// Search, filters, sort, the customer preset, page and page size live in the URL: a filtered list is a link.
export function usePowersOfAttorneyList(): PowersOfAttorneyListState {
    const { fromQuery, toQuery } = useUrlSyncedState(POWERS_OF_ATTORNEY_URL_DEFAULTS, '');
    const urlState: PowersOfAttorneyUrlState = { ...POWERS_OF_ATTORNEY_URL_DEFAULTS };
    const page = ref(1);
    fromQuery(urlState, page);
    const initial = fromPowersOfAttorneyUrlState(urlState);

    const filters = shallowRef<PowersOfAttorneyListFilters>(initial.filters);
    const sort = ref<PowersOfAttorneySort>(initial.sort);
    const counterpartyId = ref(initial.counterpartyId);
    const pageSize = ref(initial.pageSize);
    const items = ref<PowerOfAttorneyRow[]>([]);
    const totalItems = ref(0);
    const failed = ref(false);

    const { loading, run } = useLatestRequest(
        async () => {
            try {
                return await fetchPowersOfAttorney(
                    filters.value,
                    counterpartyId.value,
                    page.value,
                    pageSize.value,
                    sort.value,
                );
            } catch (e) {
                console.warn('[powers-of-attorney] could not load the list:', e);
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

    useUrlSearchParam(filters, '');

    watch([filters, sort, counterpartyId, pageSize], () => {
        page.value = 1;
    });
    watch([filters, sort, counterpartyId, pageSize, page], () => {
        reload();
        toQuery(
            toPowersOfAttorneyUrlState(
                filters.value,
                counterpartyId.value,
                sort.value,
                pageSize.value,
            ),
            page,
        );
    });
    onMounted(reload);

    return {
        items,
        totalItems,
        loading,
        failed,
        reload,
        filters,
        sort,
        counterpartyId,
        page,
        pageSize,
    };
}
