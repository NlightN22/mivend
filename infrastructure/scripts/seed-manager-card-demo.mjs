// Demo data for the manager card (#362): seven customers of the demo manager with different sales histories
// (steady, lost, new, returned, idle, indebted) so every tile of the card has something to show.
// Run: node infrastructure/scripts/seed-manager-card-demo.mjs (server up, `make seed` done). Idempotent per run:
// documents are keyed by erpId, so a re-run moves the relative dates forward.

const BASE_URL = `http://localhost:${process.env.PORT ?? '3000'}`;
const TOKEN = process.env.ERP_IMPORT_TOKEN ?? 'dev-import-token-change-me-0000';
const ADMIN_USER = process.env.ADMIN_USER ?? 'superadmin';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'superadmin';
const MANAGER_EMAIL = 'petr.manager@mivend.dev';
const ORGANIZATION = 'org-001';
const DAY = 24 * 60 * 60 * 1000;

// days: sale days ago; unpaid: amount still owed, due `dueIn` days from today (negative = overdue).
const CUSTOMERS = [
    { n: 1, name: 'Steady Parts', sales: range(-400, -2, 9), unpaid: 40000, dueIn: 10 },
    { n: 2, name: 'Lost Garage', sales: range(-390, -130, 14), unpaid: 90000, dueIn: -75 },
    { n: 3, name: 'Newcomer Auto', sales: range(-20, -1, 6), unpaid: 25000, dueIn: 12 },
    {
        n: 4,
        name: 'Returned Service',
        sales: [...range(-300, -230, 15), ...range(-6, -1, 3)],
        unpaid: 0,
    },
    { n: 5, name: 'Idle Workshop', sales: range(-250, -70, 12), unpaid: 12000, dueIn: -20 },
    { n: 6, name: 'Debtor Trade', sales: range(-200, -3, 8), unpaid: 260000, dueIn: -40 },
    { n: 7, name: 'Sleeping Depot', sales: range(-330, -200, 18), unpaid: 0 },
];

function range(from, to, step) {
    const out = [];
    for (let d = from; d <= to; d += step) out.push(d);
    return out;
}

const gql = async (query, variables, token) => {
    const res = await fetch(`${BASE_URL}/admin-api`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    return { data: json.data, token: res.headers.get('vendure-auth-token') };
};

async function postBatch(exchangeId, records) {
    const res = await fetch(`${BASE_URL}/erp/import/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ exchangeId, records }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json();
}

function records(now) {
    const at = days => new Date(now + days * DAY).toISOString();
    const version = new Date(now).toISOString();
    const type = (documentType, label, category, sortOrder) => ({
        type: 'settlementDocumentType',
        data: { documentType, version, label, category, customerVisible: true, sortOrder },
    });
    const out = [
        type('mc-sale', 'Sales invoice', 'sale', 1),
        type('mc-payment', 'Payment', 'payment', 2),
    ];
    for (const c of CUSTOMERS) {
        const cp = `cnt-mc-${c.n}`;
        const ct = `ctr-mc-${c.n}`;
        const entry = (amount, due) => ({
            organizationErpId: ORGANIZATION,
            counterpartyErpId: cp,
            contractErpId: ct,
            currency: 'RUB',
            amount,
            dueDate: due == null ? null : at(due),
        });
        out.push(
            {
                type: 'counterparty',
                data: {
                    erpId: cp,
                    legalName: `${c.name} LLC`,
                    shortName: c.name,
                    inn: `0000000011${String(c.n).padStart(2, '0')}`,
                    creditLimit: 500000,
                    creditBalance: c.unpaid,
                    paymentDelayDays: 14,
                    priceType: 'WHOLESALE',
                    isActive: true,
                    mainContractErpId: ct,
                    departmentId: 'dept-sales',
                },
            },
            {
                type: 'contract',
                data: {
                    erpId: ct,
                    counterpartyErpId: cp,
                    name: 'Main supply contract',
                    organizationId: ORGANIZATION,
                    priceTypeId: 'WHOLESALE',
                    creditLimit: '500000',
                    paymentDelayDays: 14,
                    debtDaysLimit: 30,
                    currency: 'RUB',
                    isCustomerContract: true,
                    isActive: true,
                },
            },
        );
        c.sales.forEach((d, i) => {
            const amount = 20000 + ((i * 7919 + c.n * 1031) % 40000);
            const last = i === c.sales.length - 1;
            out.push({
                type: 'settlementDocument',
                data: {
                    erpId: `mc-${c.n}-sale-${i}`,
                    version,
                    documentType: 'mc-sale',
                    documentTypeLabel: 'Sales invoice',
                    number: `${700000 + c.n * 1000 + i}`,
                    date: at(d),
                    entries: [entry(amount, last && c.dueIn != null ? c.dueIn : d + 14)],
                },
            });
            out.push({
                type: 'settlementDocument',
                data: {
                    erpId: `mc-${c.n}-pay-${i}`,
                    version,
                    documentType: 'mc-payment',
                    documentTypeLabel: 'Payment',
                    number: `${800000 + c.n * 1000 + i}`,
                    date: at(Math.min(d + 10, -1)),
                    entries: [entry(-amount, null)],
                },
            });
        });
        if (c.unpaid > 0) {
            out.push({
                type: 'settlementDocument',
                data: {
                    erpId: `mc-${c.n}-open`,
                    version,
                    documentType: 'mc-sale',
                    documentTypeLabel: 'Sales invoice',
                    number: `${900000 + c.n}`,
                    date: at(Math.min(c.dueIn - 14, -1)),
                    entries: [entry(c.unpaid, c.dueIn)],
                },
            });
        }
        out.push({
            type: 'settlementBalance',
            data: {
                key: `mc-balance-${c.n}`,
                version,
                organizationErpId: ORGANIZATION,
                counterpartyErpId: cp,
                contractErpId: ct,
                currency: 'RUB',
                openingDate: at(-420),
                openingBalance: 0,
                closingBalance: c.unpaid,
            },
        });
    }
    return out;
}

async function main() {
    const now = Date.now();
    const result = await postBatch(`seed-manager-card-${now}`, records(now));
    console.log(
        `import: status=${result.status} processed=${result.processed} failed=${result.failed}`,
    );
    for (const e of result.errors ?? []) console.warn(`  [${e.index}] ${e.message}`);

    const { token } = await gql(
        `mutation($u: String!, $p: String!) { login(username: $u, password: $p) { ... on CurrentUser { id } } }`,
        { u: ADMIN_USER, p: ADMIN_PASS },
    );
    const admins = await gql(
        `{ administrators(options: { take: 100 }) { items { id emailAddress } } }`,
        undefined,
        token,
    );
    const manager = admins.data.administrators.items.find(a => a.emailAddress === MANAGER_EMAIL);
    if (!manager) throw new Error(`${MANAGER_EMAIL} not found, run make seed first`);
    const list = await gql(
        `query($ids: [String!]) { counterparties(options: { take: 20, erpIds: $ids }) { items { id erpId } } }`,
        { ids: CUSTOMERS.map(c => `cnt-mc-${c.n}`) },
        token,
    );
    for (const cp of list.data.counterparties.items) {
        await gql(
            `mutation($c: ID!, $a: ID!) { reassignCounterpartyManager(counterpartyId: $c, administratorId: $a) { id } }`,
            { c: cp.id, a: manager.id },
            token,
        );
    }
    console.log(`assigned ${list.data.counterparties.items.length} customers to ${MANAGER_EMAIL}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
