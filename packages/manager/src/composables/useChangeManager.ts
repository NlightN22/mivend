import { ref, watch, type Ref } from 'vue';
import { i18n } from '../i18n';
import { ACTIVE_STATUSES, fetchBulkBatchItems } from '../api/bulkOperations';
import { reasonLabel } from '../api/bulkOperationsReport';
import { useBulkBatchFlow } from './useBulkBatchFlow';

export const MANAGER_REASSIGN_TYPE = 'counterparty-manager-reassign';

export interface ChangeManager {
    busy: Ref<boolean>;
    error: Ref<string>;
    submit: (administratorId: string) => Promise<void>;
}

// The card's single change is the bulk operation with one record, so it shows up in the batch history and can be undone there.
export function useChangeManager(
    counterpartyId: () => string,
    onApplied: () => void,
): ChangeManager {
    const flow = useBulkBatchFlow(MANAGER_REASSIGN_TYPE);
    const busy = ref(false);
    const error = ref('');

    watch(
        () => flow.batch.value?.status,
        async status => {
            const batch = flow.batch.value;
            if (!batch || !status || status === 'draft' || ACTIVE_STATUSES.includes(status)) return;
            busy.value = false;
            if (batch.appliedCount > 0) return onApplied();
            const page = await fetchBulkBatchItems(batch.uuid, 1, '', 1).catch(() => null);
            const reason = page?.items[0]?.reasonCode;
            error.value = reason
                ? reasonLabel(reason)
                : i18n.global.t('bulkOperations.requestFailed');
        },
    );

    async function submit(administratorId: string): Promise<void> {
        busy.value = true;
        error.value = '';
        const ok =
            (await flow.preview({ administratorId }, { ids: [counterpartyId()] })) &&
            (await flow.run());
        if (!ok) {
            busy.value = false;
            error.value = flow.error.value;
        }
    }

    return { busy, error, submit };
}
