import { adminGql, postBatch, shopGql, shopLoginCookie, waitForRun } from './helpers/api';
import { adminTokenFor } from './helpers/api-tokens';
import { createConfirmedOrder } from './helpers/manager-order';
import { MANAGER_ACCOUNTS, SUPERADMIN } from './fixtures/accounts';
import { seedRecords, E2E_CUSTOMER, E2E_OTHER_COUNTERPARTY_ID } from './fixtures/seed';
import { reindexSearch } from './helpers/search-reindex';
import { seedVisibility } from './fixtures/visibility/seed-visibility';
import { readVisOrders } from './fixtures/visibility/ids';
import { seedErpDocuments } from './fixtures/erp-documents/seed';
import { seedPaidOrders, seedPendingGrantRequests } from './fixtures/list-pages';
import { prepareMarkupCustomer } from './fixtures/seed-markup';
import { seedDiscountGrants } from './fixtures/discount-grants';
import { ensureCountry, ensureShippingMethod } from './fixtures/shop-basics';
import { SEED_LOCATION } from './fixtures/seed-location';
import { seedPicker } from './fixtures/seed-picker-run';

let markedAt = Date.now();
function mark(label: string): void {
    console.log(`e2e setup: ${label} ${((Date.now() - markedAt) / 1000).toFixed(1)}s`);
    markedAt = Date.now();
}

// The data every spec reads, written through the product's own interfaces; returns the shared e2e order.
export async function seedStackData(): Promise<unknown> {
    markedAt = Date.now();
    const adminToken = await adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);
    await ensureCountry(adminToken, 'RU', 'Russia');
    await ensureShippingMethod(adminToken);

    // erp-import rejects products without organizationId, which requires organizationSplitEnabled
    // (turned on by seed-erp.mjs). Query the seeded organizations instead of creating duplicates.
    const organizationsResult = await adminGql<{
        organizationRequisites: { id: string }[];
    }>(`query { organizationRequisites { id } }`, undefined, adminToken);
    const organizationIds = organizationsResult.data.organizationRequisites.map(o => Number(o.id));
    if (organizationIds.length === 0) {
        throw new Error(
            'No OrganizationRequisites found — the e2e stack seed (seed-erp.mjs) must provide them so ' +
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
    mark('seed batch');

    if (process.env.E2E_PICKER_SEED !== '0') await seedPicker(adminToken);
    mark('picker');

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
        throw new Error(
            'Seeded branch "branch-central" not found; the e2e stack seed (seed-erp.mjs) must provide it',
        );

    const warehousesResult = await adminGql<{ warehouses: { branchId: string | null }[] }>(
        `query { warehouses { branchId } }`,
        undefined,
        adminToken,
    );
    if (!warehousesResult.data.warehouses.some(w => w.branchId === centralBranchId))
        throw new Error(
            'No warehouse seeded for branch-central; the e2e stack seed (seed-erp.mjs) must provide it',
        );

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
                {
                    id: tp.id,
                    input: {
                        servicingBranchId: centralBranchId,
                        ...SEED_LOCATION,
                    },
                },
                adminToken,
            );
        }
    }
    await prepareMarkupCustomer(adminToken, centralBranchId);
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

    // The order's branch (and so its stock allocation) is resolved from the customer's preferred
    // trading point at placement time.
    const customerCookie = await shopLoginCookie(E2E_CUSTOMER.email, E2E_CUSTOMER.password);
    const preferred = await shopGql<{ setPreferredTradingPoint: boolean }>(
        `mutation($id: ID!) { setPreferredTradingPoint(tradingPointId: $id) }`,
        { id: preferredTradingPointId },
        customerCookie,
    );
    if (!preferred.setPreferredTradingPoint) throw new Error('setPreferredTradingPoint failed');

    await seedPaidOrders({ operatorToken, customerId, customerCookie, productVariantId });
    mark('paid orders');
    const order = await createConfirmedOrder(operatorToken, customerId, productVariantId);

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

    // Seed via requestDiscountGrant -> decideDiscountGrantRequest: DiscountGrant has no erp-import type.
    // A fresh DB has no WorkflowDefinition until seeded; second grant must not leak onto e2e.
    if (adminToken) {
        const definitions = [
            {
                requestType: 'discountGrantApproval',
                displayName: 'Discount grant approval',
                escalatesTo: [] as string[],
            },
            {
                requestType: 'priceAdjustmentApproval',
                displayName: 'Price adjustment approval',
                escalatesTo: ['general-director'],
            },
        ];
        for (const { requestType, displayName, escalatesTo } of definitions) {
            await adminGql(
                `mutation($requestType: String!, $displayName: String!, $steps: [WorkflowStepInput!]!) {
                    upsertWorkflowDefinition(requestType: $requestType, displayName: $displayName, steps: $steps) { requestType }
                }`,
                {
                    requestType,
                    displayName,
                    steps: [
                        {
                            order: 0,
                            role: 'department-head',
                            requiredPermission: 'ApproveDiscountRequest',
                            escalatesTo,
                        },
                    ],
                },
                adminToken,
            );
        }
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

    if (!otherCounterpartyId) throw new Error(`${E2E_OTHER_COUNTERPARTY_ID} not found`);
    await seedDiscountGrants({
        managerToken,
        deptHeadToken,
        e2eCounterpartyId,
        otherCounterpartyId,
    });
    await seedPendingGrantRequests(managerToken, otherCounterpartyId);
    mark('discount grants');
    const visIds = await seedVisibility(adminToken);
    mark('visibility');
    seedErpDocuments(await readVisOrders(adminToken, visIds));
    mark('erp documents');
    await reindexSearch(adminToken);
    mark('reindex');
    return order;
}
