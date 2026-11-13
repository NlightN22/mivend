import { ref } from 'vue';
import { tr } from '../utils/lazyLabels';
import {
    fetchDiscountLimits,
    fetchScopeOptions,
    removeDiscountLimit,
    setDiscountLimit,
    type DiscountLimitRow,
    type ScopeOption,
} from '../api/discountLimits';

export function useDiscountLimits(administratorId: string) {
    const rows = ref<DiscountLimitRow[]>([]);
    const names = ref(new Map<string, string>());
    const suggestions = ref<ScopeOption[]>([]);
    let suggestSeq = 0;
    const busy = ref(false);
    const error = ref('');

    async function loadNames(): Promise<void> {
        const kinds = [...new Set(rows.value.map(r => r.scopeKind).filter(k => k !== 'all'))];
        const next = new Map<string, string>();
        for (const kind of kinds) {
            const refs = rows.value.filter(r => r.scopeKind === kind).map(r => r.scopeRef);
            for (const o of await fetchScopeOptions(kind, null, refs))
                next.set(`${kind}:${o.ref}`, o.name);
        }
        names.value = next;
    }

    async function suggest(kind: string, search: string): Promise<void> {
        const seq = (suggestSeq += 1);
        const found = kind === 'all' ? [] : await fetchScopeOptions(kind, search || null);
        if (seq === suggestSeq) suggestions.value = found;
    }

    async function run(action: () => Promise<void>): Promise<void> {
        busy.value = true;
        error.value = '';
        try {
            await action();
            rows.value = await fetchDiscountLimits(administratorId);
            await loadNames();
        } catch (e) {
            error.value =
                e instanceof Error ? e.message : tr('settingsSystem.discountLimits.applyFailed');
        } finally {
            busy.value = false;
        }
    }

    return {
        rows,
        names,
        suggestions,
        suggest,
        busy,
        error,
        load: () => run(async () => undefined),
        save: (kind: string, scopeRef: string, percent: number) =>
            run(() => setDiscountLimit(administratorId, kind, scopeRef, percent)),
        remove: (row: DiscountLimitRow) =>
            run(() => removeDiscountLimit(administratorId, row.scopeKind, row.scopeRef)),
    };
}
