import { test, expect, type Page } from '@playwright/test';
import { adminTokenFor } from '../../helpers/api-tokens';
import { adminGql } from '../../helpers/api';
import { LONG_FIELDS_CP } from '../../fixtures/seed-long-fields';

const PHONE_WIDTHS = [360, 390, 411];
const LIST_ROUTES = [
    '/customers',
    '/orders',
    '/proforma-invoices',
    '/payments',
    '/discounts',
    '/settlements',
];
const CARD_TABS = ['overview', 'orders', 'proformaInvoices', 'discounts', 'team'];

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
    await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
        .toBeLessThanOrEqual(0);
}

async function longFieldsCounterpartyId(): Promise<string> {
    const token = await adminTokenFor('ivan.operator@mivend.dev', 'Password123!');
    const result = await adminGql<{ counterparties: { items: { id: string }[] } }>(
        `query($s: String!) { counterparties(options: { search: $s, take: 1 }) { items { id } } }`,
        { s: LONG_FIELDS_CP.shortName.slice(0, 20) },
        token,
    );
    const id = result.data.counterparties.items[0]?.id;
    if (!id) throw new Error('The long-fields counterparty is missing from the seed');
    return id;
}

for (const width of PHONE_WIDTHS) {
    test.describe(`phone width ${width} px @on:manager-operator @read-only`, () => {
        test.use({ viewport: { width, height: 844 } });

        for (const route of LIST_ROUTES) {
            test(`${route} does not scroll sideways`, async ({ page }) => {
                await page.goto(route);
                await expect(page.getByRole('main')).toBeVisible({ timeout: 15000 });
                await expectNoHorizontalOverflow(page);
            });
        }

        test('the customer card with a long name, an opaque group label and a notice fits every tab', async ({
            page,
        }) => {
            const id = await longFieldsCounterpartyId();
            for (const tab of CARD_TABS) {
                await page.goto(`/customers/${id}?tab=${tab}`);
                await expect(page.getByRole('heading', { level: 1 })).toContainText(
                    LONG_FIELDS_CP.shortName.slice(0, 15),
                    { timeout: 15000 },
                );
                await expectNoHorizontalOverflow(page);
            }
        });
    });
}
