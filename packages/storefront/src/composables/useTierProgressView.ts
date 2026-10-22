import { computed, ref, watchEffect, type ComputedRef, type Ref } from 'vue';
import type { TierLadder } from '@mivend/ui-kit';
import { useTierProgressStore } from '../stores/tierProgress';
import { formatTierValue } from '../utils/discount';
import { discountTierComplete } from '../utils/discountMessages';

// Keeps the pin visibly off the start at 0, so an untouched ladder still reads as unfinished.
const MIN_FILL = 0.06;

// The catalog price already carries the flat facet discount; discounts never stack, the best one wins.
export function flatPercentOf(
    price: number | null | undefined,
    compareAt: number | null | undefined,
): number {
    return price != null && compareAt ? Math.round((1 - price / compareAt) * 100) : 0;
}

export function useTierProgressView(
    variantId: Ref<string | undefined>,
    flatPercent: Ref<number> = ref(0),
): ComputedRef<TierLadder | null> {
    const store = useTierProgressStore();
    watchEffect(() => {
        if (variantId.value) store.track(variantId.value);
    });
    return computed(() => {
        const tp = variantId.value ? store.byVariant[variantId.value] : null;
        if (!tp) return null;
        const current = Math.max(flatPercent.value, tp.currentPercent ?? 0);
        const currentLabel = current ? `−${current}%` : '0%';
        if (tp.nextThreshold == null) {
            return {
                currentLabel,
                targetLabel: discountTierComplete(current),
                value: 1,
                max: 1,
                complete: true,
            };
        }
        if ((tp.nextPercent ?? 0) <= current) return null;
        return {
            currentLabel,
            targetLabel: `${formatTierValue(tp.nextThreshold, tp.metric)} → −${tp.nextPercent}%`,
            value: Math.max(tp.current, tp.nextThreshold * MIN_FILL),
            max: tp.nextThreshold,
        };
    });
}
