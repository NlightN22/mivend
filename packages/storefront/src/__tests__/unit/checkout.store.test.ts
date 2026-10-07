import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../../api/client', () => ({ shopApi: vi.fn() }));

import { shopApi } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { useCheckoutStore } from '../../stores/checkout';

const eligible = (...codes: string[]) =>
    vi.mocked(shopApi).mockResolvedValueOnce({
        eligibleShippingMethods: codes.map((code, i) => ({ id: String(i), code })),
    } as never);

beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(shopApi).mockReset();
});

describe('checkout store delivery methods', () => {
    it('offers only the delivery types the server reports as eligible', async () => {
        eligible('pickup');
        const store = useCheckoutStore();
        await store.loadDeliveryMethods();
        expect(store.availableDeliveries).toEqual(['pickup']);
        expect(store.selectedDelivery).toBe('pickup');
        expect(store.deliveryBlocker).toBeNull();
    });

    it('keeps courier selected when eligible but blocks it without a preferred trading point', async () => {
        eligible('pickup', 'freight-delivery');
        const store = useCheckoutStore();
        await store.loadDeliveryMethods();
        expect(store.availableDeliveries).toEqual(['courier', 'pickup']);
        expect(store.selectedDelivery).toBe('courier');
        expect(store.deliveryBlocker).toMatch(/trading point/);

        useAuthStore().customer = { preferredTradingPoint: { id: '1' } } as never;
        expect(store.deliveryBlocker).toBeNull();
    });

    it('reports an unavailable selection instead of switching silently', async () => {
        eligible('pickup');
        const store = useCheckoutStore();
        await store.loadDeliveryMethods();
        store.setDelivery('courier');
        expect(store.deliveryBlocker).toMatch(/not available/);
    });
});
