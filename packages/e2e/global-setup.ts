import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { adminGql, postBatch, waitForRun } from './helpers/api';
import { adminTokenFor } from './helpers/api-tokens';
import { loginAs } from './helpers/storefront-auth';
import { loginAsManager } from './helpers/manager-auth';
import { cancelTestOrder, createConfirmedOrder } from './helpers/manager-order';
import { MANAGER_ACCOUNTS, SUPERADMIN } from './fixtures/accounts';
import { markRunStart } from './helpers/session-cleanup';
import { E2E_BROWSER_USER_AGENT } from './helpers/user-agent';
import { seedRecords, E2E_CUSTOMER, E2E_OTHER_COUNTERPARTY_ID } from './fixtures/seed';

const AUTH_DIR = path.join(__dirname, '.auth');
const STOREFRONT_URL = process.env.STOREFRONT_URL ?? 'http://localhost:5173';
const MANAGER_URL = process.env.MANAGER_URL ?? 'http://localhost:5174';

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
    markRunStart();

    const adminToken = await adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);
    await ensureCountry(adminToken, 'RU', 'Russia');
    await ensureShippingMethod(adminToken);

    // erp-import rejects products without organizationId, which requires organizationSplitEnabled
    // (turned on by `make seed`). Query the seeded organizations instead of creating duplicates.
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

    // erp-import never writes servicingBranchId, so e2e trading points start null. Order visibility and
    // stock allocation key on the Branch row id, so patch it through the staff-editing mutation.
    const branchesResult = await adminGql<{ branches: { id: string; erpId: string }[] }>(
        `query { branches { id erpId } }`,
        undefined,
        adminToken,
    );
    const centralBranchId = branchesResult.data.branches.find(
        b => b.erpId === 'branch-central',
    )?.id;
    if (!centralBranchId)
        throw new Error('Seeded branch "branch-central" not found; run make seed');

    const warehousesResult = await adminGql<{ warehouses: { branchId: string | null }[] }>(
        `query { warehouses { branchId } }`,
        undefined,
        adminToken,
    );
    if (!warehousesResult.data.warehouses.some(w => w.branchId === centralBranchId))
        throw new Error('No warehouse seeded for branch-central; run make seed');

    const tradingPointFixResult = await adminGql<{
        counterparties: {
            items: {
                id: string;
                erpId: string;
                tradingPoints: { id: string; erpId: string; servicingBranchId: string | null }[];
            }[];
        };
    }>(
        `query { counterparties(options: { take: 100 }) { items { id erpId tradingPoints { id erpId servicingBranchId } } } }`,
        undefined,
        adminToken,
    );
    const e2eCounterpartyForBranchFix = tradingPointFixResult.data.counterparties.items.find(
        c => c.erpId === 'e2e-cnt-001',
    );
    if (e2eCounterpartyForBranchFix) {
        for (const tp of e2eCounterpartyForBranchFix.tradingPoints) {
            if (tp.servicingBranchId === centralBranchId) continue;
            await adminGql(
                `mutation($id: ID!, $input: TradingPointDetailsInput!) {
                    updateTradingPointDetails(id: $id, input: $input) { id }
                }`,
                { id: tp.id, input: { servicingBranchId: centralBranchId } },
                adminToken,
            );
        }
    }
    const preferredTradingPointId = e2eCounterpartyForBranchFix?.tradingPoints.find(
        tp => tp.erpId === 'e2e-tp-001',
    )?.id;
    if (!preferredTradingPointId) throw new Error('Seeded trading point e2e-tp-001 not found');

    // Operator has department-wide visibility, so this order is visible to all three manager-portal
    // test roles. Saved to JSON because the order code is server-generated, not fixed.
    const operatorToken = await adminTokenFor(
        MANAGER_ACCOUNTS.operator.username,
        MANAGER_ACCOUNTS.operator.password,
    );

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

    // Cancelling prior runs' orders is what releases allocated stock: seed resets only stockOnHand,
    // so stockAllocated creeps up. Page through all non-cancelled orders, not just the first 100.
    const pageSize = 100;
    for (;;) {
        // Keep skip at 0: cancelling removes orders from the state-filtered set, so the next page
        // shifts into view. Advancing skip would skip over them.
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
            await cancelTestOrder(operatorToken, priorOrder.id);
        }
    }

    // The order's branch (and so its stock allocation) is resolved from the customer's preferred
    // trading point at placement time.
    await adminGql(
        `mutation($input: UpdateCustomerInput!) { updateCustomer(input: $input) { __typename } }`,
        { input: { id: customerId, customFields: { preferredTradingPointId } } },
        adminToken,
    );

    const order = await createConfirmedOrder(operatorToken, customerId, productVariantId);
    fs.writeFileSync(path.join(AUTH_DIR, 'e2e-order.json'), JSON.stringify(order));

    // Portal-admin reassigns without scope limits; a department head no longer sees other admins
    // since Vendure 3.7.3 restricts administrator reads, which would block the whole suite here.
    const reassignerToken = await adminTokenFor(
        MANAGER_ACCOUNTS.portalAdmin.username,
        MANAGER_ACCOUNTS.portalAdmin.password,
    );

    // counterparties returns { items, totalItems }; take:200 is a bound matching the stopgap used
    // elsewhere (fetchAllCustomersCapped), not a real pagination need for this one-off lookup.
    const counterpartiesResult = await adminGql<{
        counterparties: { items: { id: string; erpId: string }[] };
    }>(
        `query { counterparties(options: { take: 200 }) { items { id erpId } } }`,
        undefined,
        reassignerToken,
    );
    const e2eCounterpartyId = counterpartiesResult.data.counterparties.items.find(
        c => c.erpId === 'e2e-cnt-001',
    )?.id;

    const teamResult = await adminGql<{
        teamMembers: { id: string; firstName: string; lastName: string }[];
    }>(`query { teamMembers { id firstName lastName } }`, undefined, adminToken);
    const managerAdminId = teamResult.data.teamMembers.find(
        m => m.firstName === 'Petr' && m.lastName === 'Manager',
    )?.id;

    if (!e2eCounterpartyId || !managerAdminId)
        throw new Error('e2e-cnt-001 or Petr Manager not found');
    await adminGql(
        `mutation($cid: ID!, $aid: ID!) {
            reassignCounterpartyManager(counterpartyId: $cid, administratorId: $aid) { id }
        }`,
        { cid: e2eCounterpartyId, aid: managerAdminId },
        reassignerToken,
    );

    // DiscountGrant is materialized only on approval and has no erp-import record type, so seed
    // through requestDiscountGrant -> decideDiscountGrantRequest. Second grant must not leak onto e2e.
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

    const deptHeadToken = await adminTokenFor(
        MANAGER_ACCOUNTS.departmentHead.username,
        MANAGER_ACCOUNTS.departmentHead.password,
    );
    const managerToken = await adminTokenFor(
        MANAGER_ACCOUNTS.manager.username,
        MANAGER_ACCOUNTS.manager.password,
    );

    const otherCounterpartyId = counterpartiesResult.data.counterparties.items.find(
        c => c.erpId === E2E_OTHER_COUNTERPARTY_ID,
    )?.id;

    if (e2eCounterpartyId && otherCounterpartyId) {
        // requestDiscountGrant has no natural key to upsert on and always creates a new ApprovalRequest,
        // so check for an existing grant first; duplicates break the specs' strict-mode text locators.
        const existingGrants = await adminGql<{
            discountGrantsForCounterparty: { items: { percent: number }[] };
        }>(
            `query($counterpartyId: ID!) { discountGrantsForCounterparty(counterpartyId: $counterpartyId) { items { percent } } }`,
            { counterpartyId: e2eCounterpartyId },
            deptHeadToken,
        );
        const alreadySeeded = existingGrants.data.discountGrantsForCounterparty.items.some(
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
    const context = await browser.newContext({
        baseURL: STOREFRONT_URL,
        userAgent: E2E_BROWSER_USER_AGENT,
    });
    const page = await context.newPage();

    await loginAs(page, E2E_CUSTOMER.email, E2E_CUSTOMER.password);
    await context.storageState({ path: path.join(AUTH_DIR, 'storefront-user.json') });
    await context.close();

    for (const [key, account] of Object.entries(MANAGER_ACCOUNTS)) {
        const managerContext = await browser.newContext({
            baseURL: MANAGER_URL,
            userAgent: E2E_BROWSER_USER_AGENT,
        });
        const managerPage = await managerContext.newPage();
        await loginAsManager(managerPage, account.username, account.password);
        await managerContext.storageState({ path: path.join(AUTH_DIR, `manager-${key}.json`) });
        await managerContext.close();
    }

    await browser.close();
}
