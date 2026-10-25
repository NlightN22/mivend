import { adminGql, shopGql, shopLoginCookie } from '../helpers/api';

export const MARKUP_COUNTERPARTY_ID = 'e2e-cnt-markup';
export const MARKUP_CUSTOMER = { email: 'e2e-markup@test.example', password: 'E2eTest123!' };
export const MARKUP_TRADING_POINT_ID = 'e2e-tp-markup';
export const MARKUP_PERCENT = -5;
export const MARKUP_DISCOUNT_PERCENT = 10;
export const MARKUP_DISCOUNT_QUANTITY = 5;

// WHOLESALE prices in rubles. A: markup from the first unit. B: the same markup plus a better
// positive rule from MARKUP_DISCOUNT_QUANTITY units.
export const MARKUP_PRODUCT_A = { sku: 'E2E-MKP-001', externalId: 'e2e-prod-mkp-a', price: 1000 };
export const MARKUP_PRODUCT_B = { sku: 'E2E-MKP-002', externalId: 'e2e-prod-mkp-b', price: 800 };

const product = (p: typeof MARKUP_PRODUCT_A, n: string): { type: 'product'; data: object } => ({
    type: 'product',
    data: {
        externalId: p.externalId,
        sku: p.sku,
        name: `Rate Item ${n}`,
        slug: `rate-item-${n.toLowerCase()}-e2e`,
        fullName: `Rate Item ${n} Standard Type`,
        price: p.price,
        stockOnHand: 100,
    },
});

const rule = (
    erpId: string,
    productErpId: string | null,
    conditionValue: number,
    percent: number,
): { type: 'counterpartyDiscountRule'; data: object } => ({
    type: 'counterpartyDiscountRule',
    data: {
        erpId,
        counterpartyErpId: MARKUP_COUNTERPARTY_ID,
        productErpId,
        condition: 'ПоКоличествуТовара',
        conditionValue,
        percent,
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        validTo: null,
    },
});

// Own counterparty and products keep every other spec's prices and totals untouched (#283).
export const markupSeedRecords = [
    product(MARKUP_PRODUCT_A, 'A'),
    product(MARKUP_PRODUCT_B, 'B'),
    ...[MARKUP_PRODUCT_A, MARKUP_PRODUCT_B].flatMap(p => [
        {
            type: 'price' as const,
            data: { sku: p.sku, priceTypeCode: 'WHOLESALE', price: p.price },
        },
        { type: 'stock' as const, data: { sku: p.sku, stockOnHand: 100 } },
    ]),
    {
        type: 'counterparty' as const,
        data: {
            erpId: MARKUP_COUNTERPARTY_ID,
            legalName: 'E2E Markup Company',
            shortName: 'E2E Markup Co',
            inn: '5100000003',
            creditLimit: 1000000,
            creditBalance: 0,
            paymentDelayDays: 30,
            priceType: 'WHOLESALE',
            isActive: true,
            departmentId: 'dept-sales',
        },
    },
    {
        type: 'customer' as const,
        data: {
            email: MARKUP_CUSTOMER.email,
            firstName: 'E2E',
            lastName: 'Markup',
            password: MARKUP_CUSTOMER.password,
        },
    },
    {
        type: 'customerCounterparty' as const,
        data: { customerEmail: MARKUP_CUSTOMER.email, counterpartyErpId: MARKUP_COUNTERPARTY_ID },
    },
    {
        type: 'tradingPoint' as const,
        data: {
            erpId: MARKUP_TRADING_POINT_ID,
            counterpartyErpId: MARKUP_COUNTERPARTY_ID,
            name: 'E2E Markup Point',
            address: 'Markup Street 1',
            isActive: true,
        },
    },
    rule('e2e-markup-rule-a', MARKUP_PRODUCT_A.externalId, 0, MARKUP_PERCENT),
    rule('e2e-markup-rule-b', MARKUP_PRODUCT_B.externalId, 0, MARKUP_PERCENT),
    rule('e2e-markup-win-rule', null, MARKUP_DISCOUNT_QUANTITY, MARKUP_DISCOUNT_PERCENT),
];

// erp-import never writes servicingBranchId, which order stock allocation keys on (see global-setup).
export async function prepareMarkupCustomer(
    adminToken: string,
    centralBranchId: string,
): Promise<void> {
    const { data } = await adminGql<{
        counterparties: {
            items: { erpId: string; tradingPoints: { id: string; erpId: string }[] }[];
        };
    }>(
        `query { counterparties(options: { take: 200 }) { items { erpId tradingPoints { id erpId } } } }`,
        undefined,
        adminToken,
    );
    const point = data.counterparties.items
        .find(c => c.erpId === MARKUP_COUNTERPARTY_ID)
        ?.tradingPoints.find(tp => tp.erpId === MARKUP_TRADING_POINT_ID);
    if (!point) throw new Error(`Seeded trading point ${MARKUP_TRADING_POINT_ID} not found`);
    await adminGql(
        `mutation($id: ID!, $input: TradingPointDetailsInput!) {
            updateTradingPointDetails(id: $id, input: $input) { id }
        }`,
        { id: point.id, input: { servicingBranchId: centralBranchId } },
        adminToken,
    );
    const cookie = await shopLoginCookie(MARKUP_CUSTOMER.email, MARKUP_CUSTOMER.password);
    const preferred = await shopGql<{ setPreferredTradingPoint: boolean }>(
        `mutation($id: ID!) { setPreferredTradingPoint(tradingPointId: $id) }`,
        { id: point.id },
        cookie,
    );
    if (!preferred.setPreferredTradingPoint) throw new Error('setPreferredTradingPoint failed');
}
