import { postBatch, waitForRun } from '../../helpers/api';
import {
    ACTORS,
    CLIENTS,
    CUSTOMERS,
    PRODUCT,
    VIS_BRANCHES,
    VIS_DEPARTMENTS,
    VIS_PASSWORD,
    VIS_PRICE_TYPES,
    actorEmail,
    clientErpId,
    clientName,
    customerEmail,
    documentNumber,
    pointName,
    type ClientKey,
} from './plan';

type ImportRecord = { type: string; data: Record<string, unknown> };

const ORGANIZATION = 'org-001';

// Each batch is applied on every run: erp-import upserts by business key, so a rerun changes nothing.
async function apply(name: string, records: ImportRecord[]): Promise<void> {
    const exchangeId = `e2e-vis-${name}-${Date.now()}`;
    await postBatch(exchangeId, records);
    const run = await waitForRun(exchangeId);
    if (run.errors.length > 0)
        throw new Error(`erp-import ${name} failed: ${JSON.stringify(run.errors)}`);
}

const many = (type: string, rows: Record<string, unknown>[]): ImportRecord[] =>
    rows.map(data => ({ type, data }));

export async function importStructure(): Promise<void> {
    await apply('structure', [
        ...many('department', [
            { erpId: VIS_DEPARTMENTS.root, name: 'E2E Vis root department' },
            {
                erpId: VIS_DEPARTMENTS.a,
                name: 'E2E Vis department A',
                parentErpId: VIS_DEPARTMENTS.root,
            },
            {
                erpId: VIS_DEPARTMENTS.b,
                name: 'E2E Vis department B',
                parentErpId: VIS_DEPARTMENTS.root,
            },
        ]),
        ...many('branch', [
            { erpId: VIS_BRANCHES.a, name: 'E2E Vis branch A' },
            { erpId: VIS_BRANCHES.b, name: 'E2E Vis branch B' },
        ]),
    ]);
    await apply('mapping', [
        ...many('departmentBranch', [
            { departmentErpId: VIS_DEPARTMENTS.a, branchErpId: VIS_BRANCHES.a },
            { departmentErpId: VIS_DEPARTMENTS.b, branchErpId: VIS_BRANCHES.b },
        ]),
        ...many('warehouse', [
            {
                erpId: 'e2e-vis-wh-a',
                name: 'E2E Vis warehouse A',
                branchErpId: VIS_BRANCHES.a,
                isActive: true,
            },
            {
                erpId: 'e2e-vis-wh-b',
                name: 'E2E Vis warehouse B',
                branchErpId: VIS_BRANCHES.b,
                isActive: true,
            },
        ]),
        ...many('priceType', [
            { code: VIS_PRICE_TYPES.a, name: 'E2E Vis type A', visibility: 'customer' },
            { code: VIS_PRICE_TYPES.b, name: 'E2E Vis type B', visibility: 'customer' },
            {
                code: VIS_PRICE_TYPES.confidential,
                name: 'E2E Vis confidential',
                visibility: 'confidential',
            },
        ]),
    ]);
}

export async function importEmployees(): Promise<void> {
    await apply(
        'employees',
        many(
            'employee',
            ACTORS.map(a => ({
                erpId: `e2e-vis-emp-${a.key}`,
                email: actorEmail(a.key),
                departmentErpId: a.department,
                roleCode: a.role,
            })),
        ),
    );
}

export async function importClients(organizationId: number): Promise<void> {
    const contract = (key: ClientKey): string => `${clientErpId(key)}-contract`;
    await apply('clients', [
        ...many(
            'counterparty',
            CLIENTS.map((c, index) => ({
                erpId: clientErpId(c.key),
                inn: `77009900${10 + index}`,
                legalName: `${clientName(c.key)} LLC`,
                shortName: clientName(c.key),
                creditLimit: 1000000,
                creditBalance: 0,
                paymentDelayDays: 0,
                priceType: c.priceType,
                isActive: true,
                departmentId: c.department,
                mainContractErpId: contract(c.key),
            })),
        ),
    ]);
    await apply('client-details', [
        ...many(
            'contract',
            CLIENTS.map(c => ({
                erpId: contract(c.key),
                counterpartyErpId: clientErpId(c.key),
                name: `${clientName(c.key)} main contract`,
                organizationId: ORGANIZATION,
                priceTypeId: c.priceType,
                isActive: true,
            })),
        ),
        ...many(
            'tradingPoint',
            CLIENTS.map(c => ({
                erpId: `${clientErpId(c.key)}-point`,
                counterpartyErpId: clientErpId(c.key),
                name: pointName(c.key),
                address: `E2E street ${c.key}`,
                isActive: true,
            })),
        ),
        ...many(
            'document',
            CLIENTS.map(c => ({
                erpId: `${clientErpId(c.key)}-document`,
                type: 'reconciliation',
                counterpartyErpId: clientErpId(c.key),
                number: documentNumber(c.key),
                issueDate: '2026-09-15T00:00:00.000Z',
                amount: 1000,
                currencyCode: 'RUB',
                fileUrl: '/documents/sample-document.pdf',
            })),
        ),
        ...many(
            'customer',
            CUSTOMERS.map(c => ({
                email: customerEmail(c.key),
                firstName: 'E2E Vis',
                lastName: c.key,
                password: VIS_PASSWORD,
            })),
        ),
        ...many('product', [
            {
                externalId: `ext-${PRODUCT.sku}`,
                sku: PRODUCT.sku,
                name: PRODUCT.name,
                slug: PRODUCT.slug,
                price: PRODUCT.prices.a,
                stockOnHand: PRODUCT.stock,
                organizationId,
            },
        ]),
    ]);
    await apply('client-links', [
        ...many(
            'customerCounterparty',
            CUSTOMERS.map(c => ({
                customerEmail: customerEmail(c.key),
                counterpartyErpId: clientErpId(c.client),
            })),
        ),
        ...many('price', [
            { sku: PRODUCT.sku, priceTypeCode: VIS_PRICE_TYPES.a, price: PRODUCT.prices.a },
            { sku: PRODUCT.sku, priceTypeCode: VIS_PRICE_TYPES.b, price: PRODUCT.prices.b },
            {
                sku: PRODUCT.sku,
                priceTypeCode: VIS_PRICE_TYPES.confidential,
                price: PRODUCT.prices.confidential,
            },
        ]),
        ...many('stock', [{ sku: PRODUCT.sku, stockOnHand: PRODUCT.stock }]),
    ]);
}
