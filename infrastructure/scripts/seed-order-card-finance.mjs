// Finance demo for the manager order card (#320): an overdue debt and a retro-bonus rule for the demo buyer cnt-001.
// Goes through erp-import only; idempotent (fixed exchange ids). Local contour only.
//
// Run: node infrastructure/scripts/seed-order-card-finance.mjs (server running, seed-order-flags done; PORT defaults to 3000).

const BASE_URL = `http://localhost:${process.env.PORT ?? '3000'}`;
const IMPORT_TOKEN = process.env.ERP_IMPORT_TOKEN ?? 'dev-import-token-change-me-0000';
const COUNTERPARTY = 'cnt-001';
const CONTRACT = 'ctr-seed-flags-org-001';
const ORGANIZATION = 'org-001';
const DAY = 24 * 60 * 60 * 1000;
const RETRO_PRODUCTS = ['seed-FLAG-STOCK-01', 'seed-FLAG-LIMIT-01', 'seed-FLAG-PENDING-01'];

async function importBatch(exchangeId, records) {
    const res = await fetch(`${BASE_URL}/erp/import/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${IMPORT_TOKEN}` },
        body: JSON.stringify({ exchangeId, records }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const result = await res.json();
    if (result.failed > 0) throw new Error(`Import failed: ${JSON.stringify(result.errors)}`);
}

function overdueRecords(now) {
    const at = days => new Date(now + days * DAY).toISOString();
    const version = new Date(now).toISOString();
    const entry = (amount, dueDays) => ({
        organizationErpId: ORGANIZATION,
        counterpartyErpId: COUNTERPARTY,
        contractErpId: CONTRACT,
        currency: 'RUB',
        amount,
        dueDate: at(dueDays),
    });
    return [
        {
            type: 'settlementDocumentType',
            data: {
                documentType: 'seed-card-sales-invoice',
                version,
                label: 'Sales invoice',
                category: 'sale',
                customerVisible: true,
                sortOrder: 1,
            },
        },
        {
            type: 'settlementDocument',
            data: {
                erpId: 'seed-card-invoice-1',
                version,
                documentType: 'seed-card-sales-invoice',
                documentTypeLabel: 'Sales invoice',
                number: '910001',
                date: at(-40),
                entries: [entry(30000, -12)],
            },
        },
        {
            type: 'settlementDocument',
            data: {
                erpId: 'seed-card-invoice-2',
                version,
                documentType: 'seed-card-sales-invoice',
                documentTypeLabel: 'Sales invoice',
                number: '910002',
                date: at(-20),
                entries: [entry(18000, -3)],
            },
        },
        {
            type: 'settlementBalance',
            data: {
                key: 'seed-card-balance',
                version,
                organizationErpId: ORGANIZATION,
                counterpartyErpId: COUNTERPARTY,
                contractErpId: CONTRACT,
                currency: 'RUB',
                openingDate: at(-90),
                openingBalance: 0,
                closingBalance: 48000,
            },
        },
    ];
}

async function main() {
    const now = Date.now();
    await importBatch('seed-order-card-overdue-v1', overdueRecords(now));
    await importBatch('seed-order-card-retro-v1', [
        {
            type: 'retroBonusSetup',
            data: {
                erpId: 'seed-card-retro-rule',
                version: new Date(now).toISOString(),
                documentNumber: '000501',
                percent: 3,
                counterpartyErpId: COUNTERPARTY,
                productErpIds: RETRO_PRODUCTS,
            },
        },
    ]);
    console.log('Overdue debt and a 3% retro-bonus rule are set for cnt-001.');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
