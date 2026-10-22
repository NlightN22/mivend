import { gqlOk, login } from '../harness/graphql';
import { postBatch, type ImportTarget } from './erp-import-seed';
import {
    BRANCHES,
    BRANCH_PRICE_TYPE,
    GRANTS,
    PRICED_PRODUCT,
    PRICE_TYPES,
    STAFF_PASSWORD,
    grantJustification,
    staffEmail,
    type GrantKey,
} from './fixture-plan';

const REQUEST = `mutation($i: DiscountGrantInput!) { requestDiscountGrant(input: $i) { id } }`;

type Call = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

// Tax zone and rate are Vendure system config (seed-erp.mjs carve-out); the orders seed may have set them already.
async function ensureTaxZone(call: Call): Promise<void> {
    const channel = await call<{
        activeChannel: { id: string; defaultTaxZone: { id: string } | null };
    }>(`{ activeChannel { id defaultTaxZone { id } } }`);
    if (channel.activeChannel.defaultTaxZone) return;
    const zone = await call<{ createZone: { id: string } }>(
        `mutation { createZone(input: { name: "Access price zone", memberIds: [] }) { id } }`,
    );
    const categories = await call<{ taxCategories: { items: { id: string }[] } }>(
        `{ taxCategories { items { id } } }`,
    );
    const categoryId =
        categories.taxCategories.items[0]?.id ??
        (
            await call<{ createTaxCategory: { id: string } }>(
                `mutation { createTaxCategory(input: { name: "Standard", isDefault: true }) { id } }`,
            )
        ).createTaxCategory.id;
    await call(
        `mutation($z: ID!, $c: ID!) { createTaxRate(input: { name: "Access 22%", enabled: true,
            value: 22, categoryId: $c, zoneId: $z }) { id } }`,
        { z: zone.createZone.id, c: categoryId },
    );
    await call(
        `mutation($id: ID!, $z: ID!) { updateChannel(input: { id: $id, defaultTaxZoneId: $z }) {
            ... on Channel { id } } }`,
        { id: channel.activeChannel.id, z: zone.createZone.id },
    );
}

async function seedPrices(target: ImportTarget, superadmin: string): Promise<void> {
    await ensureTaxZone((query, variables) =>
        gqlOk(target.baseUrl, 'admin-api', query, variables, superadmin),
    );
    await postBatch(
        target,
        'priceType',
        [
            { code: PRICE_TYPES.a, name: 'Access type A', visibility: 'customer' },
            { code: PRICE_TYPES.b, name: 'Access type B', visibility: 'customer' },
            {
                code: PRICE_TYPES.purchase,
                name: 'Access purchase',
                visibility: 'confidential',
                isPurchase: true,
                ceilingMultiplier: PRICED_PRODUCT.floorMultiplier,
            },
        ],
        'access-pt-types',
    );
    const orgs = await gqlOk<{ organizationRequisites: { id: string; erpId: string }[] }>(
        target.baseUrl,
        'admin-api',
        `{ organizationRequisites { id erpId } }`,
        undefined,
        superadmin,
    );
    const org = orgs.organizationRequisites.find(o => o.erpId === 'access-org');
    if (!org) throw new Error('Organization access-org is missing');
    await postBatch(
        target,
        'product',
        [
            {
                externalId: `ext-${PRICED_PRODUCT.sku}`,
                sku: PRICED_PRODUCT.sku,
                name: 'Access priced product',
                slug: 'access-priced-product',
                price: PRICED_PRODUCT.prices.a,
                stockOnHand: 0,
                organizationId: Number(org.id),
            },
        ],
        'access-pt-product',
    );
    await postBatch(
        target,
        'price',
        (Object.keys(PRICE_TYPES) as (keyof typeof PRICE_TYPES)[]).map(key => ({
            sku: PRICED_PRODUCT.sku,
            priceTypeCode: PRICE_TYPES[key],
            price: PRICED_PRODUCT.prices[key],
        })),
        'access-pt-prices',
    );
    const types = await gqlOk<{ priceTypes: { id: string; code: string }[] }>(
        target.baseUrl,
        'admin-api',
        `{ priceTypes { id code } }`,
        undefined,
        superadmin,
    );
    const branches = await gqlOk<{ branches: { id: string; erpId: string }[] }>(
        target.baseUrl,
        'admin-api',
        `{ branches { id erpId } }`,
        undefined,
        superadmin,
    );
    for (const key of ['a', 'b'] as const) {
        const typeId = types.priceTypes.find(t => t.code === BRANCH_PRICE_TYPE[key])?.id;
        const branchId = branches.branches.find(b => b.erpId === BRANCHES[key])?.id;
        if (!typeId || !branchId) throw new Error(`Branch ${key} or its price type is missing`);
        await gqlOk(
            target.baseUrl,
            'admin-api',
            `mutation($b: String!, $t: String!) { setBranchSettings(branchId: $b, defaultPriceTypeId: $t,
                visiblePriceTypeIds: [$t], defaultWarehouseId: "access-placeholder") { id } }`,
            { b: branchId, t: typeId },
            superadmin,
        );
    }
}

// Approval requests are a workflow state machine, not ERP master data (same as seed-approvals.mjs).
async function seedGrants(target: ImportTarget, superadmin: string): Promise<void> {
    await gqlOk(
        target.baseUrl,
        'admin-api',
        `mutation { upsertWorkflowDefinition(requestType: "discountGrantApproval", displayName: "Discount grant approval",
            steps: [{ order: 0, role: "department-head", requiredPermission: "ApproveDiscountRequest",
            escalatesTo: ["general-director"] }]) { requestType } }`,
        undefined,
        superadmin,
    );
    const manager = await login(
        target.baseUrl,
        'admin-api',
        staffEmail('manager-a'),
        STAFF_PASSWORD,
    );
    const day = 24 * 3600 * 1000;
    for (const key of Object.keys(GRANTS) as GrantKey[]) {
        const grant = GRANTS[key];
        await gqlOk(
            target.baseUrl,
            'admin-api',
            REQUEST,
            {
                i: {
                    priceTypeCode: grant.code,
                    percent: 1,
                    validFrom: new Date().toISOString(),
                    validTo: new Date(Date.now() + 30 * day).toISOString(),
                    justification: grantJustification(key),
                },
            },
            grant.by === 'superadmin' ? superadmin : manager,
        );
    }
}

export async function seedPriceTypes(target: ImportTarget, superadmin: string): Promise<void> {
    await seedPrices(target, superadmin);
    await seedGrants(target, superadmin);
}
