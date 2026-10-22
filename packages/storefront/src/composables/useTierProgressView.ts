import { computed, watchEffect, type ComputedRef, type Ref } from 'vue';
import { useTierProgressStore } from '../stores/tierProgress';
import { formatTierValue } from '../utils/discount';
import { discountTierComplete, discountTierRemaining } from '../utils/discountMessages';

export interface TierProgressView {
    label: string;
    value: number;
    max: number;
    variant: 'normal' | 'warn';
}

// Keeps the bar visibly started at 0, so an untouched ladder still reads as unfinished.
const MIN_FILL = 0.08;

export function useTierProgressView(
    variantId: Ref<string | undefined>,
): ComputedRef<TierProgressView | null> {
    const store = useTierProgressStore();
    watchEffect(() => {
        if (variantId.value) store.track(variantId.value);
    });
    return computed(() => {
        const tp = variantId.value ? store.byVariant[variantId.value] : null;
        if (!tp) return null;
        if (tp.nextThreshold == null) {
            return {
                label: discountTierComplete(tp.currentPercent ?? 0),
                value: 1,
                max: 1,
                variant: 'normal',
            };
        }
        return {
            label: discountTierRemaining(
                formatTierValue(tp.nextThreshold - tp.current, tp.metric),
                tp.nextPercent ?? 0,
            ),
            value: Math.max(tp.current, tp.nextThreshold * MIN_FILL),
            max: tp.nextThreshold,
            variant: 'warn',
        };
    });
}
