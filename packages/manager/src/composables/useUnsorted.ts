import { ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import {
    fetchUnsortedAdministrators,
    fetchUnsortedCounterparties,
    type UnsortedAdministratorRow,
    type UnsortedCounterpartyRow,
} from '../api/visibilityGrants';

export function useUnsorted() {
    const error = ref('');
    const counterparties = ref<UnsortedCounterpartyRow[]>([]);
    const counterpartyTotal = ref(0);
    const counterpartyPage = ref(1);
    const counterpartyPageSize = ref(20);
    const counterpartySearch = ref('');
    const administrators = ref<UnsortedAdministratorRow[]>([]);
    const administratorTotal = ref(0);
    const administratorPage = ref(1);
    const administratorPageSize = ref(20);

    const { loading: counterpartiesLoading, run: runCounterparties } = useLatestRequest(
        () =>
            fetchUnsortedCounterparties({
                skip: (counterpartyPage.value - 1) * counterpartyPageSize.value,
                take: counterpartyPageSize.value,
                search: counterpartySearch.value,
            }),
        r => {
            counterparties.value = r.items;
            counterpartyTotal.value = r.totalItems;
        },
    );
    const { loading: administratorsLoading, run: runAdministrators } = useLatestRequest(
        () =>
            fetchUnsortedAdministrators({
                skip: (administratorPage.value - 1) * administratorPageSize.value,
                take: administratorPageSize.value,
            }),
        r => {
            administrators.value = r.items;
            administratorTotal.value = r.totalItems;
        },
    );

    async function guarded(run: () => Promise<void>): Promise<void> {
        try {
            await run();
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Could not load the unsorted list';
        }
    }

    return {
        error,
        counterparties,
        counterpartyTotal,
        counterpartyPage,
        counterpartyPageSize,
        counterpartySearch,
        counterpartiesLoading,
        administrators,
        administratorTotal,
        administratorPage,
        administratorPageSize,
        administratorsLoading,
        loadCounterparties: () => guarded(runCounterparties),
        loadAdministrators: () => guarded(runAdministrators),
    };
}
