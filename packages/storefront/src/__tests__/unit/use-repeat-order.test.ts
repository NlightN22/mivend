import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

const packagesOnly = ref(true);
vi.mock('../../composables/usePackagesOnly', () => ({
    usePackagesOnly: () => ({ packagesOnly, load: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock('../../composables/useMultiplicityEnforced', () => ({
    useMultiplicityEnforced: () => ({
        multiplicityEnforced: { value: false },
        load: vi.fn().mockResolvedValue(undefined),
    }),
}));
vi.mock('@mivend/ui-kit', () => ({ toast: vi.fn() }));
vi.mock('../../api/client', () => ({ shopApi: vi.fn() }));

import { useCartStore } from '../../stores/cart';
import { useRepeatOrder } from '../../pages/orders/useRepeatOrder';

const packVariant = { id: 'v-pack', customFields: { unitName: 'pack', unitRatioToBase: 6 } };
const pieceVariant = { id: 'v-piece', customFields: { unitName: 'pc', unitRatioToBase: 1 } };

describe('useRepeatOrder pack rounding', () => {
    const addItem = vi.fn();
    beforeEach(() => {
        setActivePinia(createPinia());
        addItem.mockReset().mockResolvedValue(undefined);
        packagesOnly.value = true;
        const cart = useCartStore();
        vi.spyOn(cart, 'fetchCart').mockResolvedValue(undefined);
        vi.spyOn(cart, 'addItem').mockImplementation(addItem);
    });

    it('rounds an old quantity up to whole packs on a packages-only branch', async () => {
        await useRepeatOrder().repeat([
            { quantity: 7, productVariant: packVariant },
            { quantity: 5, productVariant: pieceVariant },
        ]);
        expect(addItem).toHaveBeenCalledWith(
            'v-pack',
            12,
            expect.objectContaining({ name: 'pack', ratio: 6 }),
        );
        expect(addItem).toHaveBeenCalledWith('v-piece', 5, null);
    });

    it('keeps the quantity untouched when the branch does not sell by packages only', async () => {
        packagesOnly.value = false;
        await useRepeatOrder().repeat([{ quantity: 7, productVariant: packVariant }]);
        expect(addItem).toHaveBeenCalledWith('v-pack', 7, null);
    });

    it('sums the duplicate lines of a variant first and rounds the total once', async () => {
        await useRepeatOrder().repeat([
            { quantity: 1, productVariant: packVariant },
            { quantity: 1, productVariant: packVariant },
        ]);
        expect(addItem).toHaveBeenCalledTimes(1);
        expect(addItem).toHaveBeenCalledWith(
            'v-pack',
            6,
            expect.objectContaining({ name: 'pack', ratio: 6 }),
        );
    });

    it('counts the variants whose quantity was raised to whole packs', async () => {
        const result = await useRepeatOrder().repeat([
            { quantity: 7, productVariant: packVariant },
            { quantity: 6, productVariant: { ...packVariant, id: 'v-exact' } },
            { quantity: 5, productVariant: pieceVariant },
        ]);
        expect(result.roundedUp).toBe(1);
    });

    it('reports no rounding when the branch does not sell by packages only', async () => {
        packagesOnly.value = false;
        const result = await useRepeatOrder().repeat([
            { quantity: 7, productVariant: packVariant },
        ]);
        expect(result.roundedUp).toBe(0);
    });
});
