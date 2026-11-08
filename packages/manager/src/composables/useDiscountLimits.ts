import { ref } from 'vue';
import {
    fetchDiscountLimits,
    removeDiscountLimit,
    setDiscountLimit,
    type DiscountLimitRow,
} from '../api/discountLimits';

export function useDiscountLimits(administratorId: string) {
    const rows = ref<DiscountLimitRow[]>([]);
    const busy = ref(false);
    const error = ref('');

    async function run(action: () => Promise<void>): Promise<void> {
        busy.value = true;
        error.value = '';
        try {
            await action();
            rows.value = await fetchDiscountLimits(administratorId);
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'The change was not applied';
        } finally {
            busy.value = false;
        }
    }

    return {
        rows,
        busy,
        error,
        load: () => run(async () => undefined),
        save: (kind: string, scopeRef: string, percent: number) =>
            run(() => setDiscountLimit(administratorId, kind, scopeRef, percent)),
        remove: (row: DiscountLimitRow) =>
            run(() => removeDiscountLimit(administratorId, row.scopeKind, row.scopeRef)),
    };
}
