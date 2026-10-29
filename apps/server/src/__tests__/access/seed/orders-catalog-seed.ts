import { gqlOk } from '../harness/graphql';
import { postBatch, type ImportTarget } from './erp-import-seed';
import {
    CUSTOMER_CONTRACTS,
    CUSTOMER_PASSWORD,
    ORDER_CUSTOMERS,
    PRODUCT,
    WAREHOUSE_PREFIX,
    BRANCHES,
    counterpartyErpId,
    orderCustomerEmail,
    saleContractName,
    type CounterpartyKey,
} from './fixture-plan';

type Call = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

// Country, tax zone and rate are Vendure system config, the same carve-out as in seed-erp.mjs.
async function ensureTax(call: Call): Promise<void> {
    await call(`mutation { createCountry(input: { code: "RU", enabled: true,
        translations: [{ languageCode: en, name: "Russia" }] }) { id } }`);
    const zone = await call<{ createZone: { id: string } }>(
        `mutation { createZone(input: { name: "Access tax zone", memberIds: [] }) { id } }`,
    );
    const category = await call<{ taxCategories: { items: { id: string }[] } }>(
        `{ taxCategories { items { id } } }`,
    );
    let categoryId = category.taxCategories.items[0]?.id;
    if (!categoryId)
        categoryId = (
            await call<{ createTaxCategory: { id: string } }>(
                `mutation { createTaxCategory(input: { name: "Standard", isDefault: true }) { id } }`,
            )
        ).createTaxCategory.id;
    await call(
        `mutation($z: ID!, $c: ID!) { createTaxRate(input: { name: "Standard 22%", enabled: true,
            value: 22, categoryId: $c, zoneId: $z }) { id } }`,
        { z: zone.createZone.id, c: categoryId },
    );
    const channels = await call<{ channels: { items: { id: string }[] } }>(
        `{ channels { items { id } } }`,
    );
    await call(
        `mutation($id: ID!, $z: ID!) { updateChannel(input: { id: $id, defaultTaxZoneId: $z }) {
            ... on Channel { id } } }`,
        { id: channels.channels.items[0].id, z: zone.createZone.id },
    );
}

// Returns the id of the one orderable variant.
export async function seedCatalog(target: ImportTarget, superadmin: string): Promise<string> {
    const call: Call = (query, variables) =>
        gqlOk(target.baseUrl, 'admin-api', query, variables, superadmin);
    await ensureTax(call);
    // Every branch an order can resolve to needs its own stock location to allocate from.
    const branches = await call<{ branches: { erpId: string }[] }>(`{ branches { erpId } }`);
    await postBatch(
        target,
        'warehouse',
        branches.branches.map(b => ({
            erpId: `${WAREHOUSE_PREFIX}${b.erpId}`,
            name: `Access warehouse ${b.erpId}`,
            branchErpId: b.erpId,
            isActive: true,
            ...(b.erpId === BRANCHES.a ? { stockLocationName: 'Default Stock Location' } : {}),
        })),
        'order-warehouse',
    );
    const orgs = await call<{ organizationRequisites: { id: string; erpId: string }[] }>(
        `{ organizationRequisites { id erpId } }`,
    );
    const org = orgs.organizationRequisites.find(o => o.erpId === 'access-org');
    if (!org) throw new Error('Organization access-org is missing');
    await postBatch(
        target,
        'product',
        [
            {
                externalId: `ext-${PRODUCT.sku}`,
                sku: PRODUCT.sku,
                name: 'Access product',
                slug: 'access-product',
                price: PRODUCT.price,
                stockOnHand: PRODUCT.stock,
                organizationId: Number(org.id),
            },
        ],
        'order-product',
    );
    await postBatch(
        target,
        'price',
        [
            {
                productExternalId: `ext-${PRODUCT.sku}`,
                priceTypeCode: 'RETAIL',
                price: PRODUCT.price,
            },
        ],
        'order-price',
    );
    await postBatch(
        target,
        'stock',
        [{ sku: PRODUCT.sku, stockOnHand: PRODUCT.stock }],
        'order-stock',
    );
    await postBatch(
        target,
        'contract',
        Object.entries(CUSTOMER_CONTRACTS).map(([cp, erpId]) => ({
            erpId,
            counterpartyErpId: counterpartyErpId(cp as CounterpartyKey),
            name: saleContractName(cp as CounterpartyKey),
            organizationId: 'access-org',
            priceTypeId: 'RETAIL',
            isActive: true,
            isCustomerContract: true,
        })),
        'sale-contract',
    );
    await postBatch(
        target,
        'customer',
        ORDER_CUSTOMERS.map(c => ({
            email: orderCustomerEmail(c.key),
            firstName: 'Access',
            lastName: c.key,
            password: CUSTOMER_PASSWORD,
        })),
        'order-customer',
    );
    await postBatch(
        target,
        'customerCounterparty',
        ORDER_CUSTOMERS.map(c => ({
            customerEmail: orderCustomerEmail(c.key),
            counterpartyErpId: counterpartyErpId(c.counterparty),
        })),
        'order-customer-counterparty',
    );
    const variants = await call<{ productVariants: { items: { id: string }[] } }>(
        `query($s: String!) { productVariants(options: { filter: { sku: { eq: $s } } }) { items { id } } }`,
        { s: PRODUCT.sku },
    );
    const variant = variants.productVariants.items[0];
    if (!variant) throw new Error(`Variant ${PRODUCT.sku} was not imported`);
    return variant.id;
}
