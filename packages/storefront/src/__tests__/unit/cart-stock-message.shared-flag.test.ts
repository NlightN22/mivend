import { describe, expect, it, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('@mivend/ui-kit', () => ({ toast: vi.fn() }));
vi.mock('../../api/client', () => ({ shopApi: vi.fn() }));

import { toast } from '@mivend/ui-kit';
import { shopApi } from '../../api/client';
import { setLocale } from '../../i18n';
import { usePackagesOnly } from '../../composables/usePackagesOnly';
import { useCartStore } from '../../stores/cart';
import { AdjustCartLineDocument, PackagesOnlySalesDocument } from '../../api/generated/graphql';

// usePackagesOnly keeps its flag in a module-level ref (no inject/onMounted), so the store can read it
// from an action outside any component.
describe('cart store reads the shared packages-only flag outside a component', () => {
    it('names the pack unit once the flag was loaded elsewhere', async () => {
        vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
        vi.stubGlobal('document', { documentElement: {} });
        vi.useFakeTimers();
        setActivePinia(createPinia());
        await setLocale('en');
        vi.mocked(shopApi).mockImplementation((async (doc: unknown) => {
            if (doc === PackagesOnlySalesDocument) return { packagesOnlySales: true };
            if (doc === AdjustCartLineDocument) {
                return {
                    adjustOrderLine: {
                        __typename: 'InsufficientStockError',
                        errorCode: 'INSUFFICIENT_STOCK_ERROR',
                        quantityAvailable: 50,
                    },
                };
            }
            return { activeOrder: null };
        }) as never);
        await usePackagesOnly().load();

        const store = useCartStore();
        store.order = {
            lines: [
                {
                    id: 'l1',
                    quantity: 50,
                    discountedLinePrice: 100,
                    discountedLinePriceWithTax: 100,
                    productVariant: {
                        id: 'v1',
                        customFields: { unitName: 'pack', unitRatioToBase: 50 },
                    },
                },
            ],
        } as never;
        const done = store.adjustItem('l1', 100);
        await vi.advanceTimersByTimeAsync(400);
        await done;
        vi.useRealTimers();
        vi.unstubAllGlobals();

        expect(vi.mocked(toast).mock.calls[0][0]).toBe('Only 1 pack available');
    });
});
