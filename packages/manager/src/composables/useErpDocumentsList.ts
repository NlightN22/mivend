import { onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import {
    fetchErpDocuments,
    type ErpDocumentRow,
    type ErpDocumentsListFilters,
    type ErpDocumentsPreset,
    type ErpDocumentsSort,
} from '../api/erpDocumentsList';
import type { ErpDocumentKind } from '../api/erpDocumentKinds';
import { useUrlSearchParam } from './useUrlSearchParam';
import { useUrlSyncedState } from './useUrlSyncedState';
import {
    ERP_DOCUMENTS_URL_DEFAULTS,
    fromErpDocumentsUrlState,
    toErpDocumentsUrlState,
    type ErpDocumentsUrlState,
} from './erpDocumentsListUrl';

export interface ErpDocumentsListState {
    items: Ref<ErpDocumentRow[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    reload: () => void;
    filters: Ref<ErpDocumentsListFilters>;
    sort: Ref<ErpDocumentsSort>;
    preset: Ref<ErpDocumentsPreset>;
    page: Ref<number>;
    pageSize: Ref<number>;
}

// Search, filters, sort, the order/customer preset, page and page size live in the URL: a filtered list is a link.
export function useErpDocumentsList(kind: ErpDocumentKind): ErpDocumentsListState {
    const { fromQuery, toQuery } = useUrlSyncedState(ERP_DOCUMENTS_URL_DEFAULTS, '');
    const urlState: ErpDocumentsUrlState = { ...ERP_DOCUMENTS_URL_DEFAULTS };
    const page = ref(1);
    fromQuery(urlState, page);
    const initial = fromErpDocumentsUrlState(urlState);

    const filters = shallowRef<ErpDocumentsListFilters>(initial.filters);
    const sort = ref<ErpDocumentsSort>(initial.sort);
    const preset = ref<ErpDocumentsPreset>(initial.preset);
    const pageSize = ref(initial.pageSize);
    const items = ref<ErpDocumentRow[]>([]);
    const totalItems = ref(0);
    const failed = ref(false);

    const { loading, run } = useLatestRequest(
        async () => {
            try {
                return await fetchErpDocuments(
                    kind,
                    filters.value,
                    preset.value,
                    page.value,
                    pageSize.value,
                    sort.value,
                );
            } catch (e) {
                console.warn('[erp-documents] could not load the list:', e);
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

    watch([filters, sort, preset, pageSize], () => {
        page.value = 1;
    });
    watch([filters, sort, preset, pageSize, page], () => {
        reload();
        toQuery(
            toErpDocumentsUrlState(filters.value, preset.value, sort.value, pageSize.value),
            page,
        );
    });
    onMounted(reload);

    return { items, totalItems, loading, failed, reload, filters, sort, preset, page, pageSize };
}
