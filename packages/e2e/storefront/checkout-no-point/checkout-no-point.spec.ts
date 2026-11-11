import { TEST_TIMEOUT_MS } from '../../timeouts';
import { test, expect, type Page } from '@playwright/test';
import { gql } from '../orders/helpers';
import {
    addSku,
    admin,
    cancelOpenOrders,
    loginBuyer,
    waitForCheckoutReady,
} from '../checkout-credit/helpers';

const NO_POINT_BUYER = 'nopoint@buyer.example';
const NO_BRANCH_BUYER = 'nobranch@buyer.example';

test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(TEST_TIMEOUT_MS.standard);

async function openCheckout(page: Page, email: string): Promise<void> {
    await loginBuyer(page, email);
    await addSku(page, 'E2E-FLT-001', 1);
    await page.goto('/checkout');
    await waitForCheckoutReady(page);
}

async function cartLineCount(page: Page): Promise<number> {
    const data = (await gql(page, `{ activeOrder { lines { id } } }`)) as {
        activeOrder: { lines: { id: string }[] } | null;
    };
    return data.activeOrder?.lines.length ?? 0;
}

test.describe('checkout of a customer without a trading point (#347)', () => {
    test.beforeEach(async () => {
        await cancelOpenOrders(NO_POINT_BUYER);
    });
    test.afterEach(async () => {
        await cancelOpenOrders(NO_POINT_BUYER);
    });

    test('cash is placed, the cart is emptied and the order page opens', async ({ page }) => {
        await openCheckout(page, NO_POINT_BUYER);
        await page.getByRole('button', { name: /^Cash/i }).click();
        await page.getByRole('button', { name: 'Place order' }).click();
        await expect(page).toHaveURL(/\/order-created\?code=/, { timeout: 20000 });
        expect(await cartLineCount(page)).toBe(0);

        const code = new URL(page.url()).searchParams.get('code') as string;
        const data = await admin<{
            orders: { items: { state: string; customFields: { branchId: string | null } }[] };
        }>(
            `query($c: String!) { orders(options: { filter: { code: { eq: $c } } }) { items { state customFields { branchId } } } }`,
            { c: code },
        );
        expect(data.orders.items[0].state).not.toBe('ArrangingPayment');
        expect(data.orders.items[0].customFields.branchId).toBeTruthy();
    });

    test('bank proforma invoice is placed and the cart is emptied', async ({ page }) => {
        await openCheckout(page, NO_POINT_BUYER);
        await page.getByRole('button', { name: /Bank proforma invoice/i }).click();
        await page.getByRole('button', { name: 'Place order & get proforma invoice' }).click();
        await expect(page).toHaveURL(/\/order-created\?code=/, { timeout: 20000 });
        expect(await cartLineCount(page)).toBe(0);
    });
});

test.describe.serial('checkout where no branch can be resolved (#347)', () => {
    let savedDefaultBranch: string | null = null;

    test.beforeAll(async () => {
        const data = await admin<{
            globalSettings: { customFields: { defaultBranchId: string | null } };
        }>(`{ globalSettings { customFields { defaultBranchId } } }`);
        savedDefaultBranch = data.globalSettings.customFields.defaultBranchId;
        await admin(
            `mutation { updateGlobalSettings(input: { customFields: { defaultBranchId: null } }) { __typename } }`,
        );
        await cancelOpenOrders(NO_BRANCH_BUYER);
    });
    test.afterAll(async () => {
        await admin(
            `mutation($b: String) { updateGlobalSettings(input: { customFields: { defaultBranchId: $b } }) { __typename } }`,
            { b: savedDefaultBranch },
        );
        await cancelOpenOrders(NO_BRANCH_BUYER);
    });

    test('shows a clear error and keeps the cart', async ({ page }) => {
        await openCheckout(page, NO_BRANCH_BUYER);
        await page.getByRole('button', { name: /^Cash/i }).click();
        await page.getByRole('button', { name: 'Place order' }).click();
        await expect(page.getByText(/cannot be placed right now/i).first()).toBeVisible({
            timeout: 15000,
        });
        await expect(page).toHaveURL(/\/checkout/);
        expect(await cartLineCount(page)).toBe(1);
    });
});
