import { ref, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import type { ChangeJournalEntry, ChangeJournalPage, PageRequest } from '../api/changeJournal';

export type ChangeJournalError = 'forbidden' | 'failed';

type Outcome = { ok: true; result: ChangeJournalPage } | { ok: false; error: ChangeJournalError };

export interface UseChangeJournal {
    entries: Ref<ChangeJournalEntry[]>;
    totalItems: Ref<number>;
    page: Ref<number>;
    pageSize: number;
    loading: Ref<boolean>;
    error: Ref<ChangeJournalError | null>;
    load: (page?: number) => Promise<void>;
}

export function classifyChangeJournalError(e: unknown): ChangeJournalError {
    const message = e instanceof Error ? e.message : String(e);
    return /not currently authorized|forbidden/i.test(message) ? 'forbidden' : 'failed';
}

export function useChangeJournal(
    fetchPage: (request: PageRequest) => Promise<ChangeJournalPage>,
    pageSize = 20,
): UseChangeJournal {
    const entries = ref<ChangeJournalEntry[]>([]);
    const totalItems = ref(0);
    const page = ref(1);
    const error = ref<ChangeJournalError | null>(null);

    const { loading, run } = useLatestRequest(
        async (target: number): Promise<Outcome> => {
            try {
                const skip = (target - 1) * pageSize;
                return { ok: true, result: await fetchPage({ skip, take: pageSize }) };
            } catch (e) {
                return { ok: false, error: classifyChangeJournalError(e) };
            }
        },
        outcome => {
            if (outcome.ok) {
                entries.value = outcome.result.items;
                totalItems.value = outcome.result.totalItems;
                error.value = null;
            } else {
                entries.value = [];
                totalItems.value = 0;
                error.value = outcome.error;
            }
        },
    );

    function load(target = page.value): Promise<void> {
        page.value = target;
        return run(target);
    }

    return { entries, totalItems, page, pageSize, loading, error, load };
}
