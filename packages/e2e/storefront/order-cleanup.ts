import { test, type Page } from '@playwright/test';
import { adminGql } from '../helpers/api';
import { adminTokenFor } from '../helpers/api-tokens';
import { readE2eOrder } from '../helpers/e2e-order';
import { cancelTestOrder } from '../helpers/manager-order';
import { SUPERADMIN } from '../fixtures/accounts';
import { gql } from './orders/helpers';

interface TouchedOrder {
    id: string;
    code: string;
    state: string;
}

async function admin<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const token = await adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);
    return (await adminGql<T>(query, variables, token)).data;
}

async function customerEmail(page: Page): Promise<string | null> {
    const data = (await gql(page, `query { activeCustomer { emailAddress } }`)) as {
        activeCustomer: { emailAddress: string } | null;
    };
    return data.activeCustomer?.emailAddress ?? null;
}

async function ordersTouchedSince(email: string, since: Date): Promise<TouchedOrder[]> {
    const data = await admin<{
        customers: { items: { orders: { items: TouchedOrder[] } }[] };
    }>(
        `query($e: String!, $s: DateTime!) { customers(options: { filter: { emailAddress: { eq: $e } } }) {
            items { orders(options: { take: 100, filter: { updatedAt: { after: $s } } }) { items { id code state } } } } }`,
        { e: email, s: since.toISOString() },
    );
    const keep = readE2eOrder().code;
    return (data.customers.items[0]?.orders.items ?? []).filter(
        o => o.code !== keep && o.state !== 'AddingItems' && o.state !== 'Draft',
    );
}

async function finishOrder(order: TouchedOrder): Promise<void> {
    await cancelTestOrder(
        await adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password),
        order.id,
    );
}

// Workers run serially (playwright.config), so every order of this customer updated during the
// test was placed or touched by it.
export function finishOrdersPlacedInEachTest(): void {
    let since = new Date();
    test.beforeEach(() => {
        since = new Date();
    });
    test.afterEach(async ({ page }) => {
        await finishOrdersTouchedSince(page, since);
    });
}

export async function finishOrdersTouchedSince(page: Page, since: Date): Promise<void> {
    const email = await customerEmail(page);
    if (!email) return;
    for (const order of await ordersTouchedSince(email, since)) await finishOrder(order);
}
