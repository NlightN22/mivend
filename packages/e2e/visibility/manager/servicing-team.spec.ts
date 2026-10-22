import { expect, test } from '@playwright/test';
import type { VisIds, VisOrder } from '../../fixtures/visibility/ids';
import {
    actorEmail,
    clientName,
    pointName,
    type CustomerKey,
} from '../../fixtures/visibility/plan';
import { openManagerAs, shot, visData } from '../session';

let ids: VisIds;
let orders: Record<CustomerKey, VisOrder>;

test.beforeAll(async () => {
    ({ ids, orders } = await visData());
});

test.describe('20: a point serviced by another branch', () => {
    test('the servicing head sees the order card with the client name, but not the client card', async ({
        browser,
    }) => {
        const s = await openManagerAs(browser, 'head-b');
        try {
            await s.page.goto(`/orders/${orders['customer-a-point'].code}`);
            await expect(
                s.page.getByText(orders['customer-a-point'].displayCode).first(),
            ).toBeVisible({ timeout: 15000 });
            await expect(
                s.page.getByText(clientName('a-point'), { exact: true }).filter({ visible: true }),
            ).toBeVisible();
            await shot(s.page, 'servicing-order-head-b');
            await s.page.goto(`/customers/${ids.clients['a-point']}`);
            await expect(s.page.getByText('Customer not found')).toBeVisible({ timeout: 15000 });
            await shot(s.page, 'servicing-customer-head-b');
        } finally {
            await s.context.close();
        }
    });

    test('the owner head keeps the client card with its point and loses the order', async ({
        browser,
    }) => {
        const s = await openManagerAs(browser, 'head-a');
        try {
            await s.page.goto(`/customers/${ids.clients['a-point']}`);
            await expect(s.page.getByText(pointName('a-point')).first()).toBeVisible({
                timeout: 15000,
            });
            await s.page.goto(`/orders/${orders['customer-a-point'].code}`);
            await expect(s.page.getByText('Order not found')).toBeVisible({ timeout: 15000 });
        } finally {
            await s.context.close();
        }
    });
});

test.describe('22: the counterparty Team tab', () => {
    test('an in-scope head sees the observer, an out-of-scope head gets "Customer not found"', async ({
        browser,
    }) => {
        const path = `/customers/${ids.clients['b-team']}?tab=team`;
        const inScope = await openManagerAs(browser, 'head-b');
        try {
            await inScope.page.goto(path);
            await expect(inScope.page.getByText('Observer', { exact: true }).first()).toBeVisible({
                timeout: 15000,
            });
            await expect(
                inScope.page.getByText('Primary manager', { exact: true }).last(),
            ).toBeVisible();
            await expect(inScope.page.getByText('Customer not found')).toHaveCount(0);
            await shot(inScope.page, 'team-tab-head-b');
        } finally {
            await inScope.context.close();
        }
        const outOfScope = await openManagerAs(browser, 'head-a');
        try {
            await outOfScope.page.goto(path);
            await expect(outOfScope.page.getByText('Customer not found')).toBeVisible({
                timeout: 15000,
            });
            await expect(outOfScope.page.getByText(actorEmail('manager-a'))).toHaveCount(0);
            await shot(outOfScope.page, 'team-tab-head-a');
        } finally {
            await outOfScope.context.close();
        }
    });
});
