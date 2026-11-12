import { onBeforeUnmount, ref, type Ref } from 'vue';
import { i18n } from '../i18n';
import {
    ACTIVE_STATUSES,
    fetchBulkBatch,
    previewBulkBatch,
    runBulkBatch,
    undoBulkBatch,
    type BulkBatch,
} from '../api/bulkOperations';

import type { BulkSelectionPayload } from '../components/bulk-operations/bulkSelection';

const POLL_MS = 1500;

export interface BulkBatchFlow {
    batch: Ref<BulkBatch | null>;
    busy: Ref<boolean>;
    error: Ref<string>;
    preview: (
        parameters: Record<string, unknown>,
        selection: BulkSelectionPayload,
    ) => Promise<boolean>;
    run: () => Promise<boolean>;
    undo: () => Promise<boolean>;
    open: (uuid: string) => Promise<boolean>;
}

// One batch moving through preview, run, polling and undo; every call reports failure as a message.
export function useBulkBatchFlow(type: string): BulkBatchFlow {
    const batch = ref<BulkBatch | null>(null);
    const busy = ref(false);
    const error = ref('');
    let timer: ReturnType<typeof setTimeout> | null = null;

    function stopPolling(): void {
        if (timer) clearTimeout(timer);
        timer = null;
    }

    function poll(): void {
        stopPolling();
        if (!batch.value || !ACTIVE_STATUSES.includes(batch.value.status)) return;
        timer = setTimeout(async () => {
            try {
                if (batch.value) batch.value = await fetchBulkBatch(batch.value.uuid);
            } catch (e) {
                error.value = e instanceof Error ? e.message : i18n.global.t('bulkOperations.refreshFailed');
            }
            poll();
        }, POLL_MS);
    }

    async function guarded(action: () => Promise<BulkBatch>): Promise<boolean> {
        busy.value = true;
        error.value = '';
        try {
            batch.value = await action();
            poll();
            return true;
        } catch (e) {
            error.value = e instanceof Error ? e.message : i18n.global.t('bulkOperations.requestFailed');
            return false;
        } finally {
            busy.value = false;
        }
    }

    onBeforeUnmount(stopPolling);

    return {
        batch,
        busy,
        error,
        preview: (parameters, selection) =>
            guarded(() => previewBulkBatch(type, parameters, selection)),
        run: () => guarded(() => runBulkBatch(batch.value?.uuid ?? '')),
        undo: () => guarded(() => undoBulkBatch(batch.value?.uuid ?? '')),
        open: uuid => guarded(() => fetchBulkBatch(uuid)),
    };
}
