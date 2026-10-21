import { test, expect } from './fixture';
import { addSku, DISCOUNTED_SKUS, settledCart } from './cart-helpers';
import {
    defaultTaxRate,
    expectGrossApi,
    expectGrossUi,
    fetchTaxedLines,
    setTaxRate,
    type DefaultTaxRate,
} from './gross-pricing';

// The tax rate is contour-wide state: run serially and always restore it.
test.describe.configure({ mode: 'serial' });

test.describe('Cart gross pricing under the default VAT rate @cart-totals', () => {
    let original: DefaultTaxRate;

    test.beforeAll(async () => {
        original = await defaultTaxRate();
    });

    test.afterAll(async () => {
        if (original) await setTaxRate(original.id, original.value);
    });

    async function checkCart(page: Parameters<typeof settledCart>[0], rate: number): Promise<void> {
        await addSku(page, DISCOUNTED_SKUS[0], 2);
        await addSku(page, DISCOUNTED_SKUS[1], 3);
        await settledCart(page);
        const lines = await fetchTaxedLines(page);
        expect(lines).toHaveLength(2);
        expectGrossApi(lines, rate);
        await expectGrossUi(page, lines);
    }

    test('current rate: unit, list price, percent, discount and total are all gross', async ({
        page,
    }) => {
        await checkCart(page, original.value);
    });

    test('changed rate: the cart re-prices consistently and the gross list comparison holds', async ({
        page,
    }) => {
        const changed = original.value === 10 ? 20 : 10;
        try {
            await setTaxRate(original.id, changed);
            await checkCart(page, changed);
        } finally {
            await setTaxRate(original.id, original.value);
        }
    });
});
