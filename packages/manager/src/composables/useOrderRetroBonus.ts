import { computed, ref, watch, type Ref } from 'vue';
import { fetchOrderRetroBonus } from '../api/orderRetroBonus';

export interface LineBonus {
    percent: number;
    amount: number | null;
}

// Display only: what the customer's retro-bonus rules promise per line; never part of a price.
export function useOrderRetroBonus(orderId: Ref<string>, reloadKey: () => unknown) {
    const shown = ref(false);
    const byLine = ref<Map<string, LineBonus>>(new Map());
    let seq = 0;

    async function load(): Promise<void> {
        const mine = (seq += 1);
        if (!orderId.value) return;
        try {
            const result = await fetchOrderRetroBonus(orderId.value);
            if (mine !== seq) return;
            shown.value = result.hasRules;
            byLine.value = new Map(
                result.lines.map(l => [l.orderLineId, { percent: l.percent, amount: l.amount }]),
            );
        } catch {
            if (mine === seq) shown.value = false;
        }
    }

    watch([orderId, reloadKey], load, { immediate: true });

    const total = computed(() =>
        [...byLine.value.values()].reduce((sum, b) => sum + (b.amount ?? 0), 0),
    );
    return { shown, byLine, total };
}
