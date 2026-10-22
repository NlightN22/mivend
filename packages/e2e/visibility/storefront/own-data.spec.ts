import { expect, test } from '@playwright/test';
import type { VisOrder } from '../../fixtures/visibility/ids';
import {
    clientErpId,
    clientName,
    customerEmail,
    documentNumber,
    pointName,
    type ClientKey,
    type CustomerKey,
} from '../../fixtures/visibility/plan';
import { expectNotReceived, openStorefrontAs, shot, visData } from '../session';

let orders: Record<CustomerKey, VisOrder>;

test.beforeAll(async () => {
    ({ orders } = await visData());
});

const PAIRS: {
    customer: CustomerKey;
    client: ClientKey;
    other: CustomerKey;
    otherClient: ClientKey;
}[] = [
    { customer: 'customer-a', client: 'a-own', other: 'customer-b', otherClient: 'b-own' },
    { customer: 'customer-b', client: 'b-own', other: 'customer-a', otherClient: 'a-own' },
];

for (const { customer, client, other, otherClient } of PAIRS) {
    const foreign = (): string[] => [
        clientName(otherClient),
        clientErpId(otherClient),
        pointName(otherClient),
        customerEmail(other),
        orders[other].displayCode,
        orders[other].proforma.number,
    ];

    test.describe(`${customer} in the storefront sees its own data only`, () => {
        test('11/21: own customer and own trading point, nothing of the other client', async ({
            browser,
        }) => {
            const s = await openStorefrontAs(browser, customer);
            try {
                await s.page.goto('/account/trading-points');
                await expect(
                    s.page.getByText(pointName(client), { exact: true }).first(),
                ).toBeVisible({
                    timeout: 15000,
                });
                await s.page.goto('/account/settings');
                await expect(s.page.locator('input[type="email"]').first()).toHaveValue(
                    customerEmail(customer),
                    { timeout: 15000 },
                );
                await shot(s.page, `storefront-settings-${customer}`);
                await expectNotReceived(s, foreign());
            } finally {
                await s.context.close();
            }
        });

        test('17: own documents only', async ({ browser }) => {
            const s = await openStorefrontAs(browser, customer);
            try {
                await s.page.goto('/documents');
                await expect(s.page.getByText(documentNumber(client)).first()).toBeVisible({
                    timeout: 15000,
                });
                await shot(s.page, `storefront-documents-${customer}`);
                await expectNotReceived(s, [documentNumber(otherClient), ...foreign()]);
            } finally {
                await s.context.close();
            }
        });

        test('orders: own order listed and opened, the other one is not found', async ({
            browser,
        }) => {
            const s = await openStorefrontAs(browser, customer);
            try {
                await s.page.goto('/orders');
                await expect(s.page.getByText(orders[customer].displayCode).first()).toBeVisible({
                    timeout: 15000,
                });
                await shot(s.page, `storefront-orders-${customer}`);
                await s.page.goto(`/orders/${orders[other].id}`);
                await expect(s.page.getByText('Order not found.')).toBeVisible({ timeout: 15000 });
                await expectNotReceived(s, foreign());
            } finally {
                await s.context.close();
            }
        });

        test('proforma invoices: own one listed, the other one is not found', async ({
            browser,
        }) => {
            const s = await openStorefrontAs(browser, customer);
            try {
                await s.page.goto('/proforma-invoices');
                await expect(
                    s.page.getByText(orders[customer].proforma.number).first(),
                ).toBeVisible({ timeout: 15000 });
                await shot(s.page, `storefront-proformas-${customer}`);
                await s.page.goto(`/proforma-invoices/${orders[other].proforma.id}`);
                await expect(s.page.getByText('Proforma invoice not found.')).toBeVisible({
                    timeout: 15000,
                });
                await expectNotReceived(s, foreign());
            } finally {
                await s.context.close();
            }
        });
    });
}
