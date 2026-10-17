export const E2E_CUSTOMER = {
    email: 'e2e@test.example',
    password: 'E2eTest123!',
    firstName: 'E2E',
    lastName: 'Tester',
};

export const E2E_COUNTERPARTY_ID = 'e2e-cnt-001';
// Decoy counterparty: a discount grant targets it, and it must NOT leak onto
// E2E_COUNTERPARTY_ID's Customer Detail page (customer-scope leak test).
export const E2E_OTHER_COUNTERPARTY_ID = 'e2e-cnt-002';

export const seedRecords = [
    // The add-to-cart discount toast names the product's manufacturer, so discounted products need one.
    {
        type: 'manufacturer' as const,
        data: { code: 'manufacturer-a', name: 'Manufacturer A' },
    },
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
            // Must exactly match the seeded department/branch and department-scoped roles, or scoped test
            // accounts won't see it: AccessScopeService 'department' scope needs an exact match.
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
        type: 'contract' as const,
        data: {
            erpId: 'e2e-contract-001',
            counterpartyErpId: E2E_COUNTERPARTY_ID,
            name: 'E2E contract',
            organizationId: 'e2e-org-001',
            priceTypeId: 'WHOLESALE',
            isActive: true,
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
            manufacturerCode: 'manufacturer-a',
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
    // Second product of the same brand, so a weight-tier discount triggered by one line
    // is verified to rebalance onto a different existing line.
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
            manufacturerCode: 'manufacturer-a',
            weight: 50,
        },
    },
    {
        type: 'product' as const,
        data: {
            externalId: 'e2e-prod-008',
            sku: 'E2E-OIL-003',
            name: 'Engine Oil 0W-20',
            slug: 'engine-oil-0w20-e2e',
            fullName: 'Engine Oil 0W-20 4L Synthetic',
            price: 700,
            stockOnHand: 100,
            brandCode: 'e2e-discount-brand',
            manufacturerCode: 'manufacturer-a',
            weight: 25,
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
        data: { sku: 'E2E-OIL-003', priceTypeCode: 'WHOLESALE', price: 630 },
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
    // product.stockOnHand is set only on create, never on update, so repeated e2e runs drain it;
    // stock records update by SKU on every run, keeping global-setup idempotent.
    {
        type: 'stock' as const,
        data: { sku: 'E2E-OIL-001', stockOnHand: 100 },
    },
    {
        type: 'stock' as const,
        data: { sku: 'E2E-FLT-001', stockOnHand: 50 },
    },
    {
        type: 'stock' as const,
        data: { sku: 'E2E-BRK-001', stockOnHand: 30 },
    },
    {
        type: 'stock' as const,
        data: { sku: 'E2E-OIL-003', stockOnHand: 100 },
    },
    {
        type: 'stock' as const,
        data: { sku: 'E2E-OIL-002', stockOnHand: 100 },
    },
    {
        type: 'stock' as const,
        data: { sku: 'E2E-BRK-002', stockOnHand: 30 },
    },
    {
        type: 'stock' as const,
        data: { sku: 'E2E-SPK-001', stockOnHand: 0 },
    },
    {
        type: 'stock' as const,
        data: { sku: 'E2E-AIR-001', stockOnHand: 75 },
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
        // Re-stamp issueDate to now each seed: Documents tab has no type filter; sorts issueDate DESC
        // with take/skip, and proforma invoices pile up across runs, so an old date sorts out of view.
        type: 'document' as const,
        data: {
            erpId: 'e2e-doc-contract-001',
            type: 'contract',
            counterpartyErpId: E2E_COUNTERPARTY_ID,
            number: 'E2E-CONTRACT-001',
            issueDate: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            amount: 1000000,
            currencyCode: 'RUB',
            fileUrl: '/documents/sample-document.pdf',
            metadata: {},
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
    // Deliberately inactive — the Reactivate-flow e2e positive case (customers.spec.ts).
    {
        type: 'tradingPoint' as const,
        data: {
            erpId: 'e2e-tp-004',
            counterpartyErpId: E2E_COUNTERPARTY_ID,
            name: 'E2E Inactive Point',
            address: 'Closed Ave 9',
            isActive: false,
        },
    },
];
