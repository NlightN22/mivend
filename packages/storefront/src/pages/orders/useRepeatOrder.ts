import { ref, type Ref } from 'vue';
import { useCartStore } from '../../stores/cart';
import { useCartActions } from '../../composables/useCartActions';
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
    roundedUp: number;
    failedVariantIds: string[];
}

export interface UseRepeatOrder {
    repeating: Ref<boolean>;
    result: Ref<RepeatResult | null>;
    repeat: (lines: RepeatableLine[]) => Promise<RepeatResult>;
}

export function useRepeatOrder(): UseRepeatOrder {
    const cart = useCartStore();
    const { addToCart } = useCartActions();
    const { packagesOnly, load: loadPackagesOnly } = usePackagesOnly();
    const repeating = ref(false);
    const result = ref<RepeatResult | null>(null);

    async function repeat(lines: RepeatableLine[]): Promise<RepeatResult> {
        repeating.value = true;
        try {
            await Promise.all([cart.fetchCart(), loadPackagesOnly()]);
            const requested = new Map<string, { base: number; line: RepeatableLine }>();
            for (const line of lines) {
                const id = line.productVariant.id;
                const entry = requested.get(id);
                requested.set(id, { base: (entry?.base ?? 0) + line.quantity, line });
            }
            const wanted = new Map<string, number>();
            let roundedUp = 0;
            for (const [id, { base, line }] of requested) {
                const unit = salesUnitOf(line.productVariant.customFields, packagesOnly.value);
                const quantity = unit ? roundUpToWholePacks(base, unit) : base;
                if (quantity !== base) roundedUp++;
                wanted.set(id, quantity);
            }
            const before = new Map(cart.lines.map(l => [l.productVariant.id, l.quantity]));
            const failedVariantIds: string[] = [];
            for (const [variantId, qty] of wanted) {
                try {
                    await addToCart(
                        variantId,
                        requested.get(variantId)?.line.productVariant.customFields,
                        qty,
                    );
                } catch {
                    failedVariantIds.push(variantId);
                }
            }
            const after = new Map(cart.lines.map(l => [l.productVariant.id, l.quantity]));
            let added = 0;
            for (const [variantId, qty] of wanted) {
                if ((after.get(variantId) ?? 0) >= (before.get(variantId) ?? 0) + qty) added++;
            }
            result.value = { added, skipped: wanted.size - added, roundedUp, failedVariantIds };
            return result.value;
        } finally {
            repeating.value = false;
        }
    }

    return { repeating, result, repeat };
}
