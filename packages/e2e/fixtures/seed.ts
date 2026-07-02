export const E2E_CUSTOMER = {
    email: 'e2e@test.example',
    password: 'E2eTest123!',
    firstName: 'E2E',
    lastName: 'Tester',
};

export const E2E_COUNTERPARTY_ID = 'e2e-cnt-001';

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
