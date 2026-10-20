// Balance page demo: its own customer, customer contract and settlement documents (#260).
// No e2e spec reads these ids; dates and versions follow the seed time so overdue stays overdue.
export const BALANCE_DEMO_CUSTOMER = {
    email: 'balance-demo@test.example',
    password: 'BalanceDemo123!',
};

const COUNTERPARTY = 'cnt-balance-demo';
const CONTRACT = 'ctr-balance-demo';
const ORGANIZATION = 'org-001';
const DAY = 24 * 60 * 60 * 1000;

function balanceDemoRecords(now) {
    const at = days => new Date(now + days * DAY).toISOString();
    const version = new Date(now).toISOString();
    const entry = (amount, dueDays) => ({
        organizationErpId: ORGANIZATION,
        counterpartyErpId: COUNTERPARTY,
        contractErpId: CONTRACT,
        currency: 'RUB',
        amount,
        dueDate: dueDays == null ? null : at(dueDays),
    });
    const document = (erpId, documentType, label, number, dateDays, amount, dueDays) => ({
        type: 'settlementDocument',
        data: {
            erpId,
            version,
            documentType,
            documentTypeLabel: label,
            number,
            date: at(dateDays),
            entries: [entry(amount, dueDays)],
        },
    });
    const documentType = (type, label, category, sortOrder) => ({
        type: 'settlementDocumentType',
        data: { documentType: type, version, label, category, customerVisible: true, sortOrder },
    });
    return [
        {
            type: 'customer',
            data: { ...BALANCE_DEMO_CUSTOMER, firstName: 'Balance', lastName: 'Demo' },
        },
        {
            type: 'counterparty',
            data: {
                erpId: COUNTERPARTY,
                legalName: 'Balance Demo LLC',
                shortName: 'Balance Demo',
                inn: '000000000090',
                creditLimit: 150000,
                creditBalance: 0,
                paymentDelayDays: 30,
                priceType: 'WHOLESALE',
                isActive: true,
                mainContractErpId: CONTRACT,
                departmentId: 'dept-sales',
            },
        },
        {
            type: 'customerCounterparty',
            data: { customerEmail: BALANCE_DEMO_CUSTOMER.email, counterpartyErpId: COUNTERPARTY },
        },
        {
            type: 'contract',
            data: {
                erpId: CONTRACT,
                counterpartyErpId: COUNTERPARTY,
                name: 'Balance demo supply contract',
                organizationId: ORGANIZATION,
                priceTypeId: 'WHOLESALE',
                creditLimit: '150000',
                paymentDelayDays: 30,
                debtDaysLimit: 45,
                currency: 'RUB',
                isCustomerContract: true,
                isActive: true,
            },
        },
        documentType('balance-demo-sales-invoice', 'Sales invoice', 'sale', 1),
        documentType('balance-demo-payment', 'Payment', 'payment', 2),
        // FIFO: the payment covers 900001 fully and 900002 partly; 900003 is not due yet.
        document(
            'balance-demo-inv-1',
            'balance-demo-sales-invoice',
            'Sales invoice',
            '900001',
            -60,
            30000,
            -30,
        ),
        document(
            'balance-demo-inv-2',
            'balance-demo-sales-invoice',
            'Sales invoice',
            '900002',
            -40,
            50000,
            -10,
        ),
        document(
            'balance-demo-inv-3',
            'balance-demo-sales-invoice',
            'Sales invoice',
            '900003',
            -5,
            40000,
            25,
        ),
        document(
            'balance-demo-pay-1',
            'balance-demo-payment',
            'Payment',
            '900004',
            -20,
            -60000,
            null,
        ),
        {
            type: 'settlementBalance',
            data: {
                key: 'balance-demo-balance',
                version,
                organizationErpId: ORGANIZATION,
                counterpartyErpId: COUNTERPARTY,
                contractErpId: CONTRACT,
                currency: 'RUB',
                openingDate: at(-90),
                openingBalance: 0,
                closingBalance: 60000,
            },
        },
    ];
}

export async function seedBalanceDemo(postBatch) {
    const now = Date.now();
    const records = balanceDemoRecords(now);
    console.log(`Sending ${records.length} balance demo records...`);
    // A new exchangeId per run: the relative dates must be re-applied on every seed.
    const result = await postBatch(`seed-balance-demo-${now}`, records);
    console.log(
        `  → status=${result.status} processed=${result.processed} failed=${result.failed}`,
    );
    for (const e of result.errors ?? []) console.warn(`    [${e.index}] ${e.message}`);
}
