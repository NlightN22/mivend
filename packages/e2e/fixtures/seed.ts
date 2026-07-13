export const E2E_CUSTOMER = {
    email: 'e2e@test.example',
    password: 'E2eTest123!',
    firstName: 'E2E',
    lastName: 'Tester',
};

export const E2E_COUNTERPARTY_ID = 'e2e-cnt-001';
// A second, unrelated counterparty used only as the target of a discount grant that must
// NOT be visible on E2E_COUNTERPARTY_ID's Customer Detail page — see
// DiscountGrantService.findForCounterparty's customer-scope leak test.
export const E2E_OTHER_COUNTERPARTY_ID = 'e2e-cnt-002';

export const seedRecords = [
    {
        type: 'customer' as const,
        data: {
            email: E2E_CUSTOMER.email,
            firstName: E2E_CUSTOMER.firstName,
            lastName: E2E_CUSTOMER.lastName,
            password: E2E_CUSTOMER.password,
        },
    },
    {
        type: 'counterparty' as const,
        data: {
            erpId: E2E_COUNTERPARTY_ID,
            legalName: 'E2E Company',
            shortName: 'E2E Co',
            creditLimit: 100000,
            creditBalance: 0,
            paymentDelayDays: 30,
            priceType: 'WHOLESALE',
            isActive: true,
            // Must match the seeded manager-portal org structure (infrastructure/scripts/
            // seed-erp.mjs's departments/branches + seed-access-roles.mjs's department-scoped
            // roles) or department-scoped test accounts (operator, department-head) won't see
            // this counterparty at all — see AccessScopeService's 'department' scope, which
            // requires an exact match, not just "any department set".
            departmentId: 'dept-sales',
            branchId: 'branch-central',
        },
    },
    {
        type: 'customerCounterparty' as const,
        data: {
            customerEmail: E2E_CUSTOMER.email,
            counterpartyErpId: E2E_COUNTERPARTY_ID,
        },
    },
    {
        type: 'product' as const,
        data: {
            externalId: 'e2e-prod-001',
            sku: 'E2E-OIL-001',
            name: 'Engine Oil 5W-30',
            slug: 'engine-oil-5w30',
            fullName: 'Engine Oil 5W-30 4L Synthetic',
            price: 850,
            stockOnHand: 100,
            brandCode: 'e2e-discount-brand',
            weight: 100,
        },
    },
    {
        type: 'product' as const,
        data: {
            externalId: 'e2e-prod-002',
            sku: 'E2E-FLT-001',
            name: 'Oil Filter',
            slug: 'oil-filter-e2e',
            fullName: 'Oil Filter Standard Type',
            price: 320,
            stockOnHand: 50,
        },
    },
    {
        type: 'product' as const,
        data: {
            externalId: 'e2e-prod-003',
            sku: 'E2E-BRK-001',
            name: 'Brake Pads Front',
            slug: 'brake-pads-front-e2e',
            fullName: 'Brake Pads Front Disc Type',
            price: 1200,
            stockOnHand: 30,
            brandCode: 'e2e-amount-brand',
        },
    },
    // Second product sharing e2e-discount-brand — exists to test that a weight-tier
    // discount unlocked by one order line correctly rebalances onto a *different*
    // pre-existing line of the same brand (cross-line tier-rebalance coverage).
    {
        type: 'product' as const,
        data: {
            externalId: 'e2e-prod-006',
            sku: 'E2E-OIL-002',
            name: 'Engine Oil 5W-40',
            slug: 'engine-oil-5w40-e2e',
            fullName: 'Engine Oil 5W-40 4L Synthetic',
            price: 550,
            stockOnHand: 100,
            brandCode: 'e2e-discount-brand',
            weight: 50,
        },
    },
    // Second product sharing e2e-amount-brand — same purpose, for the amount-tier ladder.
    {
        type: 'product' as const,
        data: {
            externalId: 'e2e-prod-007',
            sku: 'E2E-BRK-002',
            name: 'Brake Pads Rear',
            slug: 'brake-pads-rear-e2e',
            fullName: 'Brake Pads Rear Disc Type',
            price: 800,
            stockOnHand: 30,
            brandCode: 'e2e-amount-brand',
        },
    },
    {
        type: 'product' as const,
        data: {
            externalId: 'e2e-prod-004',
            sku: 'E2E-SPK-001',
            name: 'Spark Plug',
            slug: 'spark-plug-e2e',
            fullName: 'Spark Plug Iridium Type',
            price: 450,
            stockOnHand: 0,
        },
    },
    {
        type: 'product' as const,
        data: {
            externalId: 'e2e-prod-005',
            sku: 'E2E-AIR-001',
            name: 'Air Filter',
            slug: 'air-filter-e2e',
            fullName: 'Air Filter Paper Element',
            price: 280,
            stockOnHand: 75,
        },
    },
    {
        type: 'crossReference' as const,
        data: {
            externalId: 'e2e-prod-001',
            refs: [
                { oemCode: '15400-RTA-003', oemBrand: 'Honda' },
                { oemCode: '1109-AY', oemBrand: 'Ford' },
            ],
        },
    },
    {
        type: 'crossReference' as const,
        data: {
            externalId: 'e2e-prod-002',
            refs: [{ oemCode: '90915-YZZD1', oemBrand: 'Toyota' }],
        },
    },
    {
        type: 'price' as const,
        data: { sku: 'E2E-OIL-001', priceTypeCode: 'WHOLESALE', price: 765 },
    },
    {
        type: 'price' as const,
        data: { sku: 'E2E-FLT-001', priceTypeCode: 'WHOLESALE', price: 290 },
    },
    {
        type: 'price' as const,
        data: { sku: 'E2E-BRK-001', priceTypeCode: 'WHOLESALE', price: 1080 },
    },
    {
        type: 'price' as const,
        data: { sku: 'E2E-SPK-001', priceTypeCode: 'WHOLESALE', price: 405 },
    },
    {
        type: 'price' as const,
        data: { sku: 'E2E-OIL-002', priceTypeCode: 'WHOLESALE', price: 495 },
    },
    {
        type: 'price' as const,
        data: { sku: 'E2E-BRK-002', priceTypeCode: 'WHOLESALE', price: 720 },
    },
    {
        type: 'price' as const,
        data: { sku: 'E2E-AIR-001', priceTypeCode: 'WHOLESALE', price: 252 },
    },
    {
        type: 'discountRule' as const,
        data: {
            erpId: 'e2e-discount-rule-001',
            priceTypeCode: 'WHOLESALE',
            facetCode: 'brand',
            facetValueCode: 'e2e-discount-brand',
            percent: 10,
            validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            minWeightKg: null,
        },
    },
    {
        type: 'discountRule' as const,
        data: {
            erpId: 'e2e-discount-rule-volume-001',
            priceTypeCode: 'WHOLESALE',
            facetCode: 'brand',
            facetValueCode: 'e2e-discount-brand',
            percent: 25,
            validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            minWeightKg: 200,
        },
    },
    {
        type: 'discountRule' as const,
        data: {
            erpId: 'e2e-discount-rule-amount-001',
            priceTypeCode: 'WHOLESALE',
            facetCode: 'brand',
            facetValueCode: 'e2e-amount-brand',
            percent: 30,
            validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            minAmount: 2000,
        },
    },
    {
        type: 'counterparty' as const,
        data: {
            erpId: E2E_OTHER_COUNTERPARTY_ID,
            legalName: 'E2E Other Company',
            shortName: 'E2E Other Co',
            creditLimit: 50000,
            creditBalance: 0,
            paymentDelayDays: 30,
            priceType: 'WHOLESALE',
            isActive: true,
            departmentId: 'dept-sales',
            branchId: 'branch-central',
        },
    },
    {
        type: 'tradingPoint' as const,
        data: {
            erpId: 'e2e-tp-001',
            counterpartyErpId: E2E_COUNTERPARTY_ID,
            name: 'E2E Trading Point',
            address: 'Test Street 1',
            isActive: true,
        },
    },
    {
        type: 'tradingPoint' as const,
        data: {
            erpId: 'e2e-tp-002',
            counterpartyErpId: E2E_COUNTERPARTY_ID,
            name: 'E2E North Depot',
            address: 'North Ave 42',
            isActive: true,
        },
    },
    {
        type: 'tradingPoint' as const,
        data: {
            erpId: 'e2e-tp-003',
            counterpartyErpId: E2E_COUNTERPARTY_ID,
            name: 'E2E Warehouse',
            address: 'Warehouse Rd 7',
            isActive: true,
        },
    },
];
