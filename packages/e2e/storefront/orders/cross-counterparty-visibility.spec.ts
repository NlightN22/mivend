import { test, expect } from '@playwright/test';
import { TEST_TIMEOUT_MS } from '../../timeouts';
import { finishOrdersPlacedInEachTest } from '../order-cleanup';
import { PASSWORD, PREPAY_BUYER } from '../checkout-credit/helpers';
import { gql, placeTestOrder } from './helpers';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';

finishOrdersPlacedInEachTest();
test.setTimeout(TEST_TIMEOUT_MS.standard);

const ORDER_FIELDS = `code statusHistory { status occurredAt } customFields { erpStatus erpPaidAmount erpRejectionReasonCode erpRejectionReasonText deliveryAddress }`;

test.describe('cross-counterparty order visibility', () => {
    test("another counterparty's customer cannot read the order, its statusHistory or ERP fields", async ({
        page,
        browser,
    }) => {
        const { code } = await placeTestOrder(page);
        const res = await page.request.post(`${SERVER_URL}/erp/callback/order-status`, {
            data: { orderCode: code, status: 'UNDER_APPROVAL', erpOrderId: `E2E-${code}` },
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': process.env.ERP_CALLBACK_API_KEY ?? 'dev-callback-key-change-me-0000',
            },
        });
        expect(res.ok()).toBe(true);
        await expect(async () => {
            const own = (await gql(
                page,
                `query($c: String!) { orderByCode(code: $c) { ${ORDER_FIELDS} } }`,
                { c: code },
            )) as { orderByCode: { statusHistory: unknown[] } | null };
            expect(own.orderByCode?.statusHistory.length).toBeGreaterThan(0);
        }).toPass({ timeout: 15000 });

        const intruderCtx = await browser.newContext({
            storageState: { cookies: [], origins: [] },
        });
        try {
            const intruder = await intruderCtx.newPage();
            await gql(
                intruder,
                `mutation($u: String!, $p: String!) { login(username: $u, password: $p) { __typename } }`,
                { u: PREPAY_BUYER, p: PASSWORD },
            );
            const byCode = (await gql(
                intruder,
                `query($c: String!) { orderByCode(code: $c) { ${ORDER_FIELDS} } }`,
                { c: code },
            ).catch(() => ({ orderByCode: null }))) as { orderByCode: unknown };
            expect(byCode.orderByCode).toBeNull();

            const listed = (await gql(
                intruder,
                `query($s: String!) { myOrders(search: $s, options: { take: 50 }) { items { ${ORDER_FIELDS} } } }`,
                { s: code },
            )) as { myOrders: { items: { code: string }[] } };
            expect(listed.myOrders.items.filter(o => o.code === code)).toEqual([]);
        } finally {
            await intruderCtx.close();
        }
    });
});
