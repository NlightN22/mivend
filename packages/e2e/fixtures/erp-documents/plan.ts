import type { ClientKey } from '../visibility/plan';

export type ErpDocKind = 'customerClaim' | 'salesCorrection' | 'orderCorrection';
export type OrderOwner = 'customer-a' | 'customer-b';

export interface ErpDocPlan {
    key: string;
    number: string;
    client: ClientKey | 'unknown';
    order?: OrderOwner;
    amountMinor: number;
    comment: string;
    products: string[];
    deleted?: boolean;
}

export const ERP_DOC_TABLES: Record<ErpDocKind, { header: string; goods: string }> = {
    customerClaim: { header: 'customer_claim_erp', goods: 'customer_claim_goods_line_erp' },
    salesCorrection: { header: 'sales_correction_erp', goods: 'sales_correction_goods_line_erp' },
    orderCorrection: { header: 'order_correction_erp', goods: 'order_correction_goods_line_erp' },
};

export const ERP_DOC_PATHS: Record<ErpDocKind, string> = {
    customerClaim: '/documents/customer-claims',
    salesCorrection: '/documents/sales-corrections',
    orderCorrection: '/documents/order-corrections',
};

export const ERP_DOC_TITLES: Record<ErpDocKind, string> = {
    customerClaim: 'Customer claims',
    salesCorrection: 'Sales corrections',
    orderCorrection: 'Order corrections',
};

export const ERP_DOC_PRODUCTS = {
    oil: { externalId: 'e2e-prod-001', name: 'Engine Oil 5W-30' },
    filter: { externalId: 'e2e-prod-002', name: 'Oil Filter' },
} as const;

export const ERP_DOC_ORDER_PREFIX = 'e2e-erpdoc-order-';
export const ERP_DOC_UNKNOWN_COUNTERPARTY = 'e2e-erpdoc-cp-unknown';
export const ERP_DOC_DATE = '2026-03-10T12:00:00Z';

const oil = [ERP_DOC_PRODUCTS.oil.externalId];
const both = [ERP_DOC_PRODUCTS.oil.externalId, ERP_DOC_PRODUCTS.filter.externalId];

// Order a: one document of each kind; order b: a sales and an order correction only.
export const ERP_DOCS: Record<ErpDocKind, ErpDocPlan[]> = {
    customerClaim: [
        {
            key: 'cc1',
            number: 'E2E-CC-0001',
            client: 'a-own',
            order: 'customer-a',
            amountMinor: 1234500,
            comment: 'e2e claim comment a',
            products: both,
        },
        {
            key: 'cc2',
            number: 'E2E-CC-0002',
            client: 'b-own',
            amountMinor: 50000,
            comment: 'e2e claim comment b',
            products: oil,
        },
        {
            key: 'cc3',
            number: 'E2E-CC-0003',
            client: 'a-free',
            amountMinor: 75000,
            comment: 'e2e claim comment free',
            products: oil,
        },
        {
            key: 'cc4',
            number: 'E2E-CC-0004',
            client: 'a-own',
            amountMinor: 10000,
            comment: 'e2e tombstone',
            products: oil,
            deleted: true,
        },
        {
            key: 'cc5',
            number: 'E2E-CC-0005',
            client: 'unknown',
            amountMinor: 20000,
            comment: 'e2e unknown customer',
            products: oil,
        },
    ],
    salesCorrection: [
        {
            key: 'sc1',
            number: 'E2E-SC-0001',
            client: 'a-own',
            order: 'customer-a',
            amountMinor: 250000,
            comment: 'e2e sales correction a',
            products: oil,
        },
        {
            key: 'sc2',
            number: 'E2E-SC-0002',
            client: 'b-own',
            order: 'customer-b',
            amountMinor: 99900,
            comment: 'e2e sales correction b',
            products: both,
        },
        {
            key: 'sc3',
            number: 'E2E-SC-0003',
            client: 'a-free',
            amountMinor: 30000,
            comment: 'e2e sales correction free',
            products: oil,
        },
        {
            key: 'sc4',
            number: 'E2E-SC-0004',
            client: 'b-own',
            amountMinor: 10000,
            comment: 'e2e tombstone',
            products: oil,
            deleted: true,
        },
        {
            key: 'sc5',
            number: 'E2E-SC-0005',
            client: 'unknown',
            amountMinor: 20000,
            comment: 'e2e unknown customer',
            products: oil,
        },
    ],
    orderCorrection: [
        {
            key: 'oc1',
            number: 'E2E-OC-0001',
            client: 'a-own',
            order: 'customer-a',
            amountMinor: 80000,
            comment: 'e2e order correction a',
            products: oil,
        },
        {
            key: 'oc2',
            number: 'E2E-OC-0002',
            client: 'b-own',
            order: 'customer-b',
            amountMinor: 60000,
            comment: 'e2e order correction b',
            products: oil,
        },
        {
            key: 'oc3',
            number: 'E2E-OC-0003',
            client: 'a-own',
            amountMinor: 40000,
            comment: 'e2e order correction a2',
            products: both,
        },
        {
            key: 'oc4',
            number: 'E2E-OC-0004',
            client: 'a-free',
            amountMinor: 10000,
            comment: 'e2e tombstone',
            products: oil,
            deleted: true,
        },
        {
            key: 'oc5',
            number: 'E2E-OC-0005',
            client: 'unknown',
            amountMinor: 20000,
            comment: 'e2e unknown customer',
            products: oil,
        },
    ],
};

export const ERP_DOC_KINDS = Object.keys(ERP_DOCS) as ErpDocKind[];
