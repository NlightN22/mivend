import { computed, watchEffect, type ComputedRef, type Ref } from 'vue';
import { useTierProgressStore } from '../stores/tierProgress';
import { formatTierValue } from '../utils/discount';
import { discountTierComplete, discountTierProgress } from '../utils/discountMessages';

export interface TierProgressView {
    label: string;
    value: number;
    max: number;
}

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
            return { label: discountTierComplete(tp.currentPercent ?? 0), value: 1, max: 1 };
        }
        return {
            label: discountTierProgress(
                formatTierValue(tp.current, tp.metric),
                formatTierValue(tp.nextThreshold, tp.metric),
                tp.nextPercent ?? 0,
            ),
            value: tp.current,
            max: tp.nextThreshold,
        };
    });
}
