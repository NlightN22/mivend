import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('@mivend/ui-kit', () => ({ toast: vi.fn() }));
vi.mock('../../api/client', () => ({ shopApi: vi.fn() }));
vi.mock('../../composables/usePackagesOnly', () => ({
    usePackagesOnly: () => ({ packagesOnly: { value: true }, load: async () => undefined }),
}));

import { toast } from '@mivend/ui-kit';
import { shopApi } from '../../api/client';
import { setLocale } from '../../i18n';
import { useCartStore } from '../../stores/cart';
import { AddToCartDocument, AdjustCartLineDocument } from '../../api/generated/graphql';

const pack = { name: 'pack', ratio: 50, packStep: 1 };

function failWith(doc: unknown, field: string, quantityAvailable: number): void {
    vi.mocked(shopApi).mockImplementation((async (d: unknown) =>
        d === doc
            ? {
                  [field]: {
                      __typename: 'InsufficientStockError',
                      errorCode: 'INSUFFICIENT_STOCK_ERROR',
                      quantityAvailable,
                  },
              }
            : { activeOrder: null }) as never);
}

async function addMessage(quantityAvailable: number, unit: typeof pack | null): Promise<string> {
    failWith(AddToCartDocument, 'addItemToOrder', quantityAvailable);
    vi.mocked(toast).mockClear();
    await useCartStore().addItem('v1', 50, unit);
    return vi.mocked(toast).mock.calls[0][0] as string;
}

describe('insufficient stock message', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
        vi.stubGlobal('document', { documentElement: {} });
    });
    afterEach(() => vi.unstubAllGlobals());

    it.each([
        ['en', 'Only 1 pack available', 'Only 70 pcs. available'],
        ['ru', 'Доступно только 1 pack', 'Доступно только 70 шт.'],
    ])(
        '%s: whole packs in the pack unit, pieces for base-unit lines',
        async (lang, packs, base) => {
            await setLocale(lang);
            expect(await addMessage(70, pack)).toBe(packs);
            expect(await addMessage(70, null)).toBe(base);
        },
    );

    it('says the unit is not available when less than one whole pack is left', async () => {
        await setLocale('en');
        expect(await addMessage(20, pack)).toBe(
            'Not available in pack: less than one whole pack in stock',
        );
        await setLocale('ru');
        expect(await addMessage(20, pack)).toContain('pack');
    });

    it('adjust: reads the unit from the cart line of a packs-only branch', async () => {
        vi.useFakeTimers();
        await setLocale('en');
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
        failWith(AdjustCartLineDocument, 'adjustOrderLine', 50);
        vi.mocked(toast).mockClear();
        const done = store.adjustItem('l1', 100);
        await vi.advanceTimersByTimeAsync(400);
        await done;
        vi.useRealTimers();
        expect(vi.mocked(toast).mock.calls[0][0]).toBe('Only 1 pack available');
    });
});
