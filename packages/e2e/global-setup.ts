import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { adminGql, postBatch, waitForRun } from './helpers/api';
import { loginAs } from './helpers/storefront-auth';
import { loginAsManager } from './helpers/manager-auth';
import { createConfirmedOrder } from './helpers/manager-order';
import { seedRecords, E2E_CUSTOMER, E2E_OTHER_COUNTERPARTY_ID } from './fixtures/seed';

const AUTH_DIR = path.join(__dirname, '.auth');
const STOREFRONT_URL = process.env.STOREFRONT_URL ?? 'http://localhost:5173';
const MANAGER_URL = process.env.MANAGER_URL ?? 'http://localhost:5174';
const SUPERADMIN = {
    identifier: process.env.SUPERADMIN_USERNAME ?? 'superadmin',
    password: process.env.SUPERADMIN_PASSWORD ?? 'superadmin',
};

// Seeded by infrastructure/scripts/seed-access-roles.mjs + seed-erp.mjs (run via `make seed`,
// a prerequisite for e2e per docs/e2e-testing.md) — same accounts as .tests/accounts.md. Not
// re-seeded here, only logged in, one per manager-portal dashboard KPI variant we test.
const MANAGER_ACCOUNTS = {
    operator: { username: 'ivan.operator@mivend.dev', password: 'Password123!' },
    manager: { username: 'petr.manager@mivend.dev', password: 'Password123!' },
    departmentHead: { username: 'olga.depthead@mivend.dev', password: 'Password123!' },
    portalAdmin: { username: 'anna.portaladmin@mivend.dev', password: 'Password123!' },
} as const;

async function ensureShippingMethod(token: string): Promise<void> {
    const { data } = await adminGql<{ shippingMethods: { items: { id: string }[] } }>(
        `query { shippingMethods { items { id } } }`,
        undefined,
        token,
    );
    if (data.shippingMethods.items.length > 0) return;
    await adminGql(
        `mutation($input: CreateShippingMethodInput!) { createShippingMethod(input: $input) { id } }`,
        {
            input: {
                code: 'free-shipping',
                fulfillmentHandler: 'manual-fulfillment',
                checker: {
                    code: 'default-shipping-eligibility-checker',
                    arguments: [{ name: 'orderMinimum', value: '0' }],
                },
                calculator: {
                    code: 'default-shipping-calculator',
                    arguments: [
                        { name: 'rate', value: '0' },
                        { name: 'includesTax', value: 'auto' },
                        { name: 'taxRate', value: '0' },
                    ],
                },
                translations: [{ languageCode: 'en', name: 'Free Shipping', description: '' }],
            },
        },
        token,
    );
}

async function ensureCountry(token: string, code: string, name: string): Promise<void> {
    const { data } = await adminGql<{ countries: { items: { id: string }[] } }>(
        `query($code: String!) { countries(options: { filter: { code: { eq: $code } } }) { items { id } } }`,
        { code },
        token,
    );
    if (data.countries.items.length > 0) return;
    await adminGql(
        `mutation($input: CreateCountryInput!) { createCountry(input: $input) { id } }`,
        { input: { code, translations: [{ languageCode: 'en', name }], enabled: true } },
        token,
    );
}

export default async function globalSetup(): Promise<void> {
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

    const { token: adminToken } = await adminGql<unknown>(
        `mutation($id: String!, $pw: String!) { login(username: $id, password: $pw) { ... on CurrentUser { id } } }`,
        { id: SUPERADMIN.identifier, pw: SUPERADMIN.password },
    );
    if (adminToken) {
        await ensureCountry(adminToken, 'RU', 'Russia');
        await ensureShippingMethod(adminToken);
    }

    // GlobalSettings.organizationSplitEnabled is on (make seed turns it on before this runs —
    // see docs/payments.md "Organizations") — erp-import rejects any product record without an
    // organizationId. Reuse the organizations `make seed` already created (queried, not
    // hardcoded/duplicated) rather than seeding e2e's own — e2e runs against the same dev stack.
    const organizationsResult = await adminGql<{
        organizationRequisites: { id: string }[];
    }>(`query { organizationRequisites { id } }`, undefined, adminToken);
    const organizationIds = organizationsResult.data.organizationRequisites.map(o => Number(o.id));
    if (organizationIds.length === 0) {
        throw new Error(
            'No OrganizationRequisites found — run `make seed` before the e2e suite so ' +
                'product fixtures can be assigned a real organizationId (organizationSplitEnabled ' +
                'is on, see docs/payments.md "Organizations")',
        );
    }
    let nextOrganizationIndex = 0;
    const seedRecordsWithOrganization = seedRecords.map(record => {
        if (record.type !== 'product') return record;
        const organizationId = organizationIds[nextOrganizationIndex % organizationIds.length];
        nextOrganizationIndex++;
        return { ...record, data: { ...record.data, organizationId } };
    });

    const exchangeId = `e2e-seed-${Date.now()}`;
    await postBatch(exchangeId, seedRecordsWithOrganization);
    await waitForRun(exchangeId);

    // erp-import's `tradingPoint` record type has no `servicingBranchId` field — it's
    // intentionally staff-managed only (see TradingPointService.upsert's comment: "ERP doesn't
    // know about this concept, a staff override must survive repeated ERP upserts"), defaulted
    // from the counterparty's own branchId only on a trading point's FIRST-ever creation. This
    // e2e fixture's trading points were first created before `make seed` reliably assigned the
    // counterparty a branchId, so they've been stuck at `servicingBranchId: null` ever since
    // (upserts never touch it, by design) — every department-scoped manager-portal viewer has
    // therefore never been able to see any order for this counterparty
    // (OrderVisibilityService's 'department' scope filters by the order's own denormalized
    // branchId, sourced from here). Patch it once via the real staff-editing mutation so it's
    // no longer permanently wrong regardless of how many times seeding re-runs.
    const tradingPointFixResult = await adminGql<{
        counterparties: {
            items: {
                id: string;
                erpId: string;
                tradingPoints: { id: string; servicingBranchId: string | null }[];
            }[];
        };
    }>(
        `query { counterparties(options: { take: 100 }) { items { id erpId tradingPoints { id servicingBranchId } } } }`,
        undefined,
        adminToken,
    );
    const e2eCounterpartyForBranchFix = tradingPointFixResult.data.counterparties.items.find(
        c => c.erpId === 'e2e-cnt-001',
    );
    if (e2eCounterpartyForBranchFix) {
        for (const tp of e2eCounterpartyForBranchFix.tradingPoints) {
            if (tp.servicingBranchId === 'branch-central') continue;
            await adminGql(
                `mutation($id: ID!, $input: TradingPointDetailsInput!) {
                    updateTradingPointDetails(id: $id, input: $input) { id }
                }`,
                { id: tp.id, input: { servicingBranchId: 'branch-central' } },
                adminToken,
            );
        }
    }

    // A real, deterministic order for the manager-portal Orders/Order Detail specs — operator
    // has department-wide visibility (see infrastructure/scripts/seed-access-roles.mjs), so an
    // order for the e2e counterparty's customer is visible to all three manager-portal test
    // roles. Written to a JSON file since the order code is server-generated, not fixed.
    const operatorLogin = await adminGql<{
        login: { __typename: string };
    }>(
        `mutation($id: String!, $pw: String!) { login(username: $id, password: $pw) { __typename ... on CurrentUser { id } } }`,
        { id: MANAGER_ACCOUNTS.operator.username, pw: MANAGER_ACCOUNTS.operator.password },
    );
    const operatorToken = operatorLogin.token;
    if (!operatorToken) throw new Error('Could not log in as operator to seed an e2e order');

    const customersResult = await adminGql<{
        customers: { items: { id: string; emailAddress: string }[] };
    }>(
        `query { customers(options: { take: 200 }) { items { id emailAddress } } }`,
        undefined,
        operatorToken,
    );
    const customerId = customersResult.data.customers.items.find(
        c => c.emailAddress === E2E_CUSTOMER.email,
    )?.id;
    if (!customerId) throw new Error(`Could not find Vendure customer for ${E2E_CUSTOMER.email}`);

    const variantsResult = await adminGql<{
        productVariants: { items: { id: string }[] };
    }>(
        `query { productVariants(options: { filter: { sku: { eq: "E2E-OIL-001" } } }) { items { id } } }`,
        undefined,
        operatorToken,
    );
    const productVariantId = variantsResult.data.productVariants.items[0]?.id;
    if (!productVariantId) throw new Error('Could not find product variant E2E-OIL-001');

    // Every global-setup run creates a fresh confirmed order for this customer but never
    // cancels the previous run's — stock the seed `stock` records reset is only stockOnHand,
    // never stockAllocated (Vendure tracks that as derived from real order state, not directly
    // settable), so allocated stock from old e2e orders accumulates run over run until
    // addItemToOrder starts failing with InsufficientStockError. Cancelling prior orders here
    // is the actual idempotent fix — it's the real Vendure mechanism that releases allocated
    // stock, not a stock-table workaround.
    // `take: 100` alone silently only ever covered this customer's OLDEST 100 orders (Vendure's
    // default order-list sort) — once this customer accumulated more than 100 orders across a
    // long session, every order past that first page was never reached, so its allocated stock
    // was never released and stockAllocated silently crept up to stockOnHand run over run. Filter
    // server-side to non-cancelled orders and page through ALL of them, not just the first 100.
    const pageSize = 100;
    for (;;) {
        // Always re-query from skip: 0 — cancelling an order removes it from this
        // state-filtered result set, so the next page of "still not cancelled" orders
        // naturally shifts into view; advancing skip here would skip over them instead.
        const priorOrdersResult = await adminGql<{
            customer: { orders: { items: { id: string; state: string }[] } } | null;
        }>(
            `query($id: ID!, $take: Int!) {
                customer(id: $id) {
                    orders(options: { skip: 0, take: $take, filter: { state: { notEq: "Cancelled" } } }) {
                        items { id state }
                    }
                }
            }`,
            { id: customerId, take: pageSize },
            operatorToken,
        );
        const orders = priorOrdersResult.data.customer?.orders.items ?? [];
        if (orders.length === 0) break;
        for (const priorOrder of orders) {
            await adminGql(
                `mutation($input: CancelOrderInput!) {
                    cancelOrder(input: $input) { __typename }
                }`,
                { input: { orderId: priorOrder.id } },
                operatorToken,
            );
        }
    }

    const order = await createConfirmedOrder(operatorToken, customerId, productVariantId);
    fs.writeFileSync(path.join(AUTH_DIR, 'e2e-order.json'), JSON.stringify(order));

    // Assigns the e2e counterparty to petr.manager@mivend.dev so manager-manager's "own" scope
    // (see #37) has real, deterministic data too — done via the actual reassignCounterpartyManager
    // mutation (department-head has ReassignCounterpartyManager within their own department,
    // matching the e2e counterparty's dept-sales — see fixtures/seed.ts), not a DB bypass.
    const deptHeadLogin = await adminGql<{ login: { __typename: string } }>(
        `mutation($id: String!, $pw: String!) { login(username: $id, password: $pw) { __typename ... on CurrentUser { id } } }`,
        {
            id: MANAGER_ACCOUNTS.departmentHead.username,
            pw: MANAGER_ACCOUNTS.departmentHead.password,
        },
    );
    const deptHeadToken = deptHeadLogin.token;
    if (!deptHeadToken)
        throw new Error('Could not log in as department-head to assign the e2e manager');

    // `counterparties` returns a paginated { items, totalItems } shape (see issue #39) —
    // take:200 here is a deliberate bound matching the same stopgap used elsewhere in the app
    // (fetchAllCustomersCapped etc.), not a real pagination need for this one-off setup lookup.
    const counterpartiesResult = await adminGql<{
        counterparties: { items: { id: string; erpId: string }[] };
    }>(
        `query { counterparties(options: { take: 200 }) { items { id erpId } } }`,
        undefined,
        deptHeadToken,
    );
    const e2eCounterpartyId = counterpartiesResult.data.counterparties.items.find(
        c => c.erpId === 'e2e-cnt-001',
    )?.id;

    const teamResult = await adminGql<{
        teamMembers: { id: string; firstName: string; lastName: string }[];
    }>(`query { teamMembers { id firstName lastName } }`, undefined, deptHeadToken);
    const managerAdminId = teamResult.data.teamMembers.find(
        m => m.firstName === 'Petr' && m.lastName === 'Manager',
    )?.id;

    if (e2eCounterpartyId && managerAdminId) {
        await adminGql(
            `mutation($cid: ID!, $aid: ID!) {
                reassignCounterpartyManager(counterpartyId: $cid, administratorId: $aid) { id }
            }`,
            { cid: e2eCounterpartyId, aid: managerAdminId },
            deptHeadToken,
        );
    }

    // Seeds two approved DiscountGrant rows through the real requestDiscountGrant ->
    // decideDiscountGrantRequest flow (DiscountGrant is materialized only on approval —
    // see DiscountGrantService.decideAndApply, there is no erp-import record type for it) —
    // one scoped to the e2e counterparty (positive case for the Customer Detail Discounts
    // tab) and one scoped to an unrelated counterparty (negative case: must never leak onto
    // e2e counterparty's tab, see DiscountGrantService.findForCounterparty).
    if (adminToken) {
        await adminGql(
            `mutation($requestType: String!, $displayName: String!, $steps: [WorkflowStepInput!]!) {
                upsertWorkflowDefinition(requestType: $requestType, displayName: $displayName, steps: $steps) { requestType }
            }`,
            {
                requestType: 'discountGrantApproval',
                displayName: 'Discount grant approval',
                steps: [
                    {
                        order: 0,
                        role: 'department-head',
                        requiredPermission: 'ApproveDiscountRequest',
                        escalatesTo: [],
                    },
                ],
            },
            adminToken,
        );
    }

    const managerLogin = await adminGql<{ login: { __typename: string } }>(
        `mutation($id: String!, $pw: String!) { login(username: $id, password: $pw) { __typename ... on CurrentUser { id } } }`,
        { id: MANAGER_ACCOUNTS.manager.username, pw: MANAGER_ACCOUNTS.manager.password },
    );
    const managerToken = managerLogin.token;

    const otherCounterpartyId = counterpartiesResult.data.counterparties.items.find(
        c => c.erpId === E2E_OTHER_COUNTERPARTY_ID,
    )?.id;

    if (managerToken && deptHeadToken && e2eCounterpartyId && otherCounterpartyId) {
        // requestDiscountGrant always creates a new ApprovalRequest — unlike the
        // erp-import-backed records above, it has no natural key to upsert on. Guard by
        // checking the grant already exists so re-running global-setup locally (outside a
        // fresh CI DB) doesn't pile up duplicates and break the specs' strict-mode text
        // locators.
        const existingGrants = await adminGql<{
            discountGrantsForCounterparty: { percent: number }[];
        }>(
            `query($counterpartyId: ID!) { discountGrantsForCounterparty(counterpartyId: $counterpartyId) { percent } }`,
            { counterpartyId: e2eCounterpartyId },
            deptHeadToken,
        );
        const alreadySeeded = existingGrants.data.discountGrantsForCounterparty.some(
            g => g.percent === 8,
        );

        if (!alreadySeeded) {
            const validTo = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
            const grantInput = (
                counterpartyIds: string[],
                percent: number,
            ): Record<string, unknown> => ({
                priceTypeCode: 'WHOLESALE',
                percent,
                validFrom: new Date().toISOString(),
                validTo,
                justification: 'e2e seed grant',
                counterpartyIds,
            });

            for (const [counterpartyIds, percent] of [
                [[e2eCounterpartyId], 8],
                [[otherCounterpartyId], 99],
            ] as const) {
                const requested = await adminGql<{ requestDiscountGrant: { id: string } }>(
                    `mutation($input: DiscountGrantInput!) { requestDiscountGrant(input: $input) { id } }`,
                    { input: grantInput([...counterpartyIds], percent) },
                    managerToken,
                );
                const requestId = requested.data.requestDiscountGrant.id;
                await adminGql(
                    `mutation($requestId: ID!) {
                        decideDiscountGrantRequest(requestId: $requestId, decision: "approved") { id status }
                    }`,
                    { requestId },
                    deptHeadToken,
                );
            }
        }
    }

    const browser = await chromium.launch();
    const context = await browser.newContext({ baseURL: STOREFRONT_URL });
    const page = await context.newPage();

    await loginAs(page, E2E_CUSTOMER.email, E2E_CUSTOMER.password);
    await context.storageState({ path: path.join(AUTH_DIR, 'storefront-user.json') });
    await context.close();

    for (const [key, account] of Object.entries(MANAGER_ACCOUNTS)) {
        const managerContext = await browser.newContext({ baseURL: MANAGER_URL });
        const managerPage = await managerContext.newPage();
        await loginAsManager(managerPage, account.username, account.password);
        await managerContext.storageState({ path: path.join(AUTH_DIR, `manager-${key}.json`) });
        await managerContext.close();
    }

    await browser.close();
}
