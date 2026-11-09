import { test, expect } from '@playwright/test';
import { adminGql } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import { formatDocumentNumber } from '../../helpers/e2e-order';
import { cancelTestOrder, createConfirmedOrder } from '../../helpers/manager-order';
import { MANAGER_ACCOUNTS } from '../../fixtures/accounts';
import { E2E_CUSTOMER } from '../../fixtures/seed';
import { ORDER_CP } from '../../fixtures/seed-order-cp';

interface Placed {
    code: string;
    counterpartyId: string;
    priceType: string;
}

interface Fallback {
    code: string;
}

async function customerIdByEmail(token: string, email: string): Promise<string> {
    const found = await adminGql<{ customers: { items: { id: string }[] } }>(
        `query($e: String!) { customers(options: { filter: { emailAddress: { eq: $e } } }) { items { id } } }`,
        { e: email },
        token,
    );
    const id = found.data.customers.items[0]?.id;
    if (!id) throw new Error(`Customer ${email} not found; the e2e seed must provide it`);
    return id;
}

test.describe('order counterparty comes from the order itself @on:manager-operator', () => {
    let operatorToken: string;
    let portalAdminToken: string;
    let own: Placed;
    let fallback: Fallback;
    const created: string[] = [];
    const drafts: string[] = [];

    test.beforeAll(async () => {
        operatorToken = await adminTokenFor(
            MANAGER_ACCOUNTS.operator.username,
            MANAGER_ACCOUNTS.operator.password,
        );
        portalAdminToken = await adminTokenFor(
            MANAGER_ACCOUNTS.portalAdmin.username,
            MANAGER_ACCOUNTS.portalAdmin.password,
        );
        const variants = await adminGql<{ productVariants: { items: { id: string }[] } }>(
            `query { productVariants(options: { filter: { sku: { eq: "E2E-OIL-001" } } }) { items { id } } }`,
            undefined,
            operatorToken,
        );
        const variantId = variants.data.productVariants.items[0]?.id;
        const counterparties = await adminGql<{
            counterparties: { items: { id: string; erpId: string; priceType: string }[] };
        }>(
            `query { counterparties(options: { take: 200 }) { items { id erpId priceType } } }`,
            undefined,
            portalAdminToken,
        );
        const counterparty = counterparties.data.counterparties.items.find(
            c => c.erpId === ORDER_CP.counterpartyErpId,
        );
        const team = await adminGql<{
            teamMembers: { id: string; firstName: string; lastName: string }[];
        }>(`query { teamMembers { id firstName lastName } }`, undefined, operatorToken);
        const managerId = team.data.teamMembers.find(
            m => m.firstName === 'Petr' && m.lastName === 'Manager',
        )?.id;
        if (!variantId || !counterparty || !managerId) {
            throw new Error(
                'E2E seed data is missing; seed-erp.mjs or global-setup must provide it',
            );
        }
        await adminGql(
            `mutation($c: ID!, $a: ID!) { reassignCounterpartyManager(counterpartyId: $c, administratorId: $a) { id } }`,
            { c: counterparty.id, a: managerId },
            portalAdminToken,
        );

        const customerId = await customerIdByEmail(operatorToken, ORDER_CP.customerEmail);
        const order = await createConfirmedOrder(operatorToken, customerId, variantId);
        created.push(order.id);
        // Soft-deleting the portal customer leaves the counterparty on the order only.
        await adminGql(
            `mutation($id: ID!) { deactivateCounterpartyPortalAccess(customerId: $id) { id } }`,
            { id: customerId },
            portalAdminToken,
        );
        const check = await adminGql<{ order: { counterparty: { id: string } | null } }>(
            `query($id: ID!) { order(id: $id) { counterparty { id } } }`,
            { id: order.id },
            operatorToken,
        );
        expect(check.data.order.counterparty?.id).toBe(counterparty.id);
        own = {
            code: order.code,
            counterpartyId: counterparty.id,
            priceType: counterparty.priceType,
        };

        // A draft carries no counterparty of its own, so the card falls back to the customer's.
        const draft = await adminGql<{ createDraftOrder: { id: string; code: string } }>(
            `mutation { createDraftOrder { id code } }`,
            undefined,
            operatorToken,
        );
        drafts.push(draft.data.createDraftOrder.id);
        await adminGql(
            `mutation($o: ID!, $c: ID!) { setCustomerForDraftOrder(orderId: $o, customerId: $c) { __typename } }`,
            {
                o: draft.data.createDraftOrder.id,
                c: await customerIdByEmail(operatorToken, E2E_CUSTOMER.email),
            },
            operatorToken,
        );
        fallback = { code: draft.data.createDraftOrder.code };
    });

    test.afterAll(async () => {
        for (const id of created) await cancelTestOrder(operatorToken, id);
        for (const id of drafts) {
            await adminGql(
                `mutation($id: ID!) { deleteDraftOrder(orderId: $id) { result } }`,
                { id },
                operatorToken,
            );
        }
    });

    test('the list row shows the counterparty short name and its manager @read-only', async ({
        page,
    }) => {
        await page.goto('/orders');
        await page.getByPlaceholder('Search orders…').fill(own.code);
        await expect(page.getByRole('row')).toHaveCount(2, { timeout: 15000 });
        const row = page.getByRole('row').filter({ hasText: formatDocumentNumber(own.code) });
        await expect(row).toContainText(ORDER_CP.shortName);
        await expect(row).toContainText('Petr Manager');
    });

    test('the card header links the counterparty and shows its price type @read-only', async ({
        page,
    }) => {
        await page.goto(`/orders/${own.code}`);
        const link = page.locator('.order-header__link');
        await expect(link).toHaveText(ORDER_CP.shortName, { timeout: 15000 });
        await expect(link).toHaveAttribute('href', `/customers/${own.counterpartyId}`);
        await expect(page.getByTestId('order-price-type')).toHaveText(own.priceType);
    });

    test('an order with the counterparty only through its customer still shows it @read-only', async ({
        page,
    }) => {
        await page.goto(`/orders/${fallback.code}`);
        await expect(page.locator('.order-header__link')).toHaveText('E2E Co', {
            timeout: 15000,
        });
    });
});
