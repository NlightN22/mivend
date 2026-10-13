import { ref, type Ref } from 'vue';
import { useCartStore } from '../../stores/cart';

export interface RepeatableLine {
    quantity: number;
    productVariant: { id: string };
}

export interface RepeatResult {
    added: number;
    skipped: number;
}

export interface UseRepeatOrder {
    repeating: Ref<boolean>;
    result: Ref<RepeatResult | null>;
    repeat: (lines: RepeatableLine[]) => Promise<RepeatResult>;
}

export function useRepeatOrder(): UseRepeatOrder {
    const cart = useCartStore();
    const repeating = ref(false);
    const result = ref<RepeatResult | null>(null);

    async function repeat(lines: RepeatableLine[]): Promise<RepeatResult> {
        repeating.value = true;
        try {
            await cart.fetchCart();
            const wanted = new Map<string, number>();
            for (const line of lines) {
                const id = line.productVariant.id;
                wanted.set(id, (wanted.get(id) ?? 0) + line.quantity);
            }
            const before = new Map(cart.lines.map(l => [l.productVariant.id, l.quantity]));
            for (const [variantId, qty] of wanted) await cart.addItem(variantId, qty);
            const after = new Map(cart.lines.map(l => [l.productVariant.id, l.quantity]));
            let added = 0;
            for (const [variantId, qty] of wanted) {
                if ((after.get(variantId) ?? 0) >= (before.get(variantId) ?? 0) + qty) added++;
            }
            result.value = { added, skipped: wanted.size - added };
            return result.value;
        } finally {
            repeating.value = false;
        }
    }

    return { repeating, result, repeat };
}
