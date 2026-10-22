import { expect, test } from '@playwright/test';
import type { VisOrder } from '../../fixtures/visibility/ids';
import {
    clientName,
    CUSTOMERS,
    type ActorKey,
    type CustomerKey,
} from '../../fixtures/visibility/plan';
import { expectNotReceived, openManagerAs, shot, visData } from '../session';

let orders: Record<CustomerKey, VisOrder>;

test.beforeAll(async () => {
    ({ orders } = await visData());
});

const clientOf = (key: CustomerKey): string =>
    clientName(CUSTOMERS.find(c => c.key === key)!.client);

const CASES: { actor: ActorKey; own: CustomerKey; other: CustomerKey }[] = [
    { actor: 'head-a', own: 'customer-a', other: 'customer-b' },
    { actor: 'manager-b', own: 'customer-b', other: 'customer-a' },
];

for (const { actor, own, other } of CASES) {
    test.describe(`${actor} sees its own documents and not the other branch's`, () => {
        test('orders list', async ({ browser }) => {
            const s = await openManagerAs(browser, actor);
            try {
                await s.page.goto('/orders');
                await expect(s.page.getByText(orders[own].displayCode).first()).toBeVisible({
                    timeout: 15000,
                });
                await expectNotReceived(s, [orders[other].displayCode, orders[other].code]);
                await shot(s.page, `orders-${actor}`);
            } finally {
                await s.context.close();
            }
        });

        test('proforma invoices list', async ({ browser }) => {
            const s = await openManagerAs(browser, actor);
            try {
                await s.page.goto('/proforma-invoices');
                await expect(s.page.getByText(orders[own].proforma.number).first()).toBeVisible({
                    timeout: 15000,
                });
                await expectNotReceived(s, [orders[other].proforma.number, clientOf(other)]);
                await shot(s.page, `proformas-${actor}`);
            } finally {
                await s.context.close();
            }
        });

        test('payments list', async ({ browser }) => {
            const s = await openManagerAs(browser, actor);
            try {
                await s.page.goto('/payments');
                const row = s.page.locator('main').getByText(clientOf(own), { exact: true });
                await expect(row.first()).toBeVisible({ timeout: 15000 });
                await expectNotReceived(s, [clientOf(other)]);
                await shot(s.page, `payments-${actor}`);
            } finally {
                await s.context.close();
            }
        });
    });
}
