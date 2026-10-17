import { expect, test, type Page } from '@playwright/test';
import { adminGql } from '../helpers/api';
import { adminTokenFor } from '../helpers/api-tokens';
import { readE2eOrder } from '../helpers/e2e-order';
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

// Admin cancelOrder leaves reservations active. Open proformas stay: withdrawProformaInvoice
// is broken (queries a missing attempt.status column), reported under #231.
async function finishOrder(order: TouchedOrder): Promise<void> {
    if (order.state !== 'Cancelled') {
        const res = await admin<{ cancelOrder: { __typename: string; message?: string } }>(
            `mutation($i: CancelOrderInput!) { cancelOrder(input: $i) { __typename ... on ErrorResult { message } } }`,
            { i: { orderId: order.id } },
        );
        expect(res.cancelOrder.__typename, `cancel ${order.code}`).toBe('Order');
    }
    await admin(`mutation($o: ID!) { releaseOrderReservation(orderId: $o) }`, { o: order.id });
    const left = await admin<{ orderReservations: { status: string }[] }>(
        `query($o: ID!) { orderReservations(orderId: $o) { status } }`,
        { o: order.id },
    );
    expect(
        left.orderReservations.filter(r => r.status === 'active'),
        `active reservations of ${order.code}`,
    ).toEqual([]);
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
