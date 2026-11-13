import { ref, watch, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import { toFilterColumns } from '@mivend/ui-kit/src/components/MvAdvancedDataTable/advancedDataTableTypes';
import { fetchChangeJournalForEntity, type ChangeJournalEntry } from '../api/changeJournal';
import {
    JOURNAL_DEFAULT_SORT,
    NO_JOURNAL_OPTIONS,
    buildJournalColumns,
    toJournalFilter,
} from '../components/change-journal/journalTabFilter';
import { classifyChangeJournalError, type ChangeJournalError } from './useChangeJournal';
import { useCardTabList, type CardTabListState } from './useCardTabList';

export interface EntityJournalList extends CardTabListState {
    items: Ref<ChangeJournalEntry[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    error: Ref<ChangeJournalError | null>;
    reload: () => void;
}

type Outcome =
    | { ok: true; items: ChangeJournalEntry[]; totalItems: number }
    | { ok: false; error: ChangeJournalError };

// Paging, search and filters run on the server; the entity stays fixed by the scope-checked ref.
export function useEntityJournalList(
    entityType: string,
    getEntityId: () => string,
    urlPrefix: string,
): EntityJournalList {
    const items = ref<ChangeJournalEntry[]>([]);
    const totalItems = ref(0);
    const error = ref<ChangeJournalError | null>(null);

    const { loading, run } = useLatestRequest(
        async (): Promise<Outcome> => {
            try {
                const result = await fetchChangeJournalForEntity(
                    entityType,
                    getEntityId(),
                    {
                        skip: (state.page.value - 1) * state.pageSize.value,
                        take: state.pageSize.value,
                    },
                    toJournalFilter(state.search.value, state.conditions.value),
                );
                return { ok: true, ...result };
            } catch (e) {
                return { ok: false, error: classifyChangeJournalError(e) };
            }
        },
        outcome => {
            error.value = outcome.ok ? null : outcome.error;
            items.value = outcome.ok ? outcome.items : [];
            totalItems.value = outcome.ok ? outcome.totalItems : 0;
        },
    );
    const reload = (): void => void run();

    const state = useCardTabList({
        urlPrefix,
        filterColumns: toFilterColumns(buildJournalColumns(NO_JOURNAL_OPTIONS)),
        sortFields: [],
        defaultSort: JOURNAL_DEFAULT_SORT,
        onChange: reload,
    });
    watch(getEntityId, () => {
        state.page.value = 1;
        reload();
    });
    reload();

    return { ...state, items, totalItems, loading, error, reload };
}
