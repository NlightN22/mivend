import { ref, type Ref } from 'vue';
import { useCartStore } from '../../stores/cart';
import { usePackagesOnly } from '../../composables/usePackagesOnly';
import { roundUpToWholePacks, salesUnitOf } from '../../composables/useSalesUnit';

export interface RepeatableLine {
    quantity: number;
    productVariant: {
        id: string;
        customFields?: { unitName?: string | null; unitRatioToBase?: number | null } | null;
    };
}

export interface RepeatResult {
    added: number;
    skipped: number;
    failedVariantIds: string[];
}

export interface UseRepeatOrder {
    repeating: Ref<boolean>;
    result: Ref<RepeatResult | null>;
    repeat: (lines: RepeatableLine[]) => Promise<RepeatResult>;
}

export function useRepeatOrder(): UseRepeatOrder {
    const cart = useCartStore();
    const { packagesOnly, load: loadPackagesOnly } = usePackagesOnly();
    const repeating = ref(false);
    const result = ref<RepeatResult | null>(null);

    async function repeat(lines: RepeatableLine[]): Promise<RepeatResult> {
        repeating.value = true;
        try {
            await Promise.all([cart.fetchCart(), loadPackagesOnly()]);
            const wanted = new Map<string, number>();
            for (const line of lines) {
                const id = line.productVariant.id;
                const unit = salesUnitOf(line.productVariant.customFields, packagesOnly.value);
                const quantity = unit ? roundUpToWholePacks(line.quantity, unit) : line.quantity;
                wanted.set(id, (wanted.get(id) ?? 0) + quantity);
            }
            const before = new Map(cart.lines.map(l => [l.productVariant.id, l.quantity]));
            const failedVariantIds: string[] = [];
            for (const [variantId, qty] of wanted) {
                try {
                    await cart.addItem(variantId, qty);
                } catch {
                    failedVariantIds.push(variantId);
                }
            }
            const after = new Map(cart.lines.map(l => [l.productVariant.id, l.quantity]));
            let added = 0;
            for (const [variantId, qty] of wanted) {
                if ((after.get(variantId) ?? 0) >= (before.get(variantId) ?? 0) + qty) added++;
            }
            result.value = { added, skipped: wanted.size - added, failedVariantIds };
            return result.value;
        } finally {
            repeating.value = false;
        }
    }

    return { repeating, result, repeat };
}
